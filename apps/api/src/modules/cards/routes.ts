import type { FastifyInstance } from "fastify";
import type { CreditCard } from "@prisma/client";
import {
  addMonths, cardInput, cardPatch, computeStatement, fromCents, purchasePatch, installmentMonths, purchaseInput,
  splitInstallments, statementPatch, statementPay, statementQuery, toCents, type CardDto, type CommitmentDto, type PurchaseDto,
} from "@finanzas/shared";
import { z } from "zod";
import { isoDate } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { fromDbDate, num, parse, toDbDate } from "../../lib.js";
import { buildStatement, resolveFirstMonth } from "./statement.js";
import { resolveUsdEstimate } from "../fx/service.js";

const dto = (c: CreditCard): CardDto => ({
  id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay, stampTaxRate: num(c.stampTaxRate),
  isThirdParty: c.isThirdParty, isDefault: c.isDefault, payAccountId: c.payAccountId,
});

export async function cardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { id: string } }>("/api/cards/:id/first-month", async (req, reply) => {
    const q = parse(z.object({ date: isoDate }), req.query, reply);
    if (!q) return;
    const card = await prisma.creditCard.findUnique({ where: { id: req.params.id } });
    if (!card) return reply.code(404).send({ error: "Tarjeta no encontrada" });
    return { month: await resolveFirstMonth(card, q.date) };
  });

  /** La predeterminada primero; el resto por nombre. */
  app.get("/api/cards", async () => (await prisma.creditCard.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] })).map(dto));

  app.post("/api/cards", async (req, reply) => {
    const body = parse(cardInput, req.body, reply);
    if (!body) return;
    return reply.code(201).send(dto(await prisma.creditCard.create({ data: { ...body, payAccountId: body.payAccountId ?? null } })));
  });

  app.patch<{ Params: { id: string } }>("/api/cards/:id", async (req, reply) => {
    const body = parse(cardPatch, req.body, reply);
    if (!body) return;
    if (!(await prisma.creditCard.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Tarjeta no encontrada" });
    // solo puede haber una predeterminada
    if (body.isDefault) await prisma.creditCard.updateMany({ where: { isDefault: true, id: { not: req.params.id } }, data: { isDefault: false } });
    return dto(await prisma.creditCard.update({ where: { id: req.params.id }, data: body }));
  });

  // ---- compras en cuotas ----
  app.get("/api/card-purchases", async (req, reply) => {
    const q = parse(z.object({ cardId: z.string().optional() }), req.query, reply);
    if (!q) return;
    const rows = await prisma.cardPurchase.findMany({ where: { cardId: q.cardId }, include: { shares: true }, orderBy: { date: "desc" } });
    return rows.map((p): PurchaseDto => ({
      id: p.id, cardId: p.cardId, date: fromDbDate(p.date), description: p.description, categoryId: p.categoryId,
      totalAmount: num(p.totalAmount), installmentCount: p.installmentCount, firstStatementMonth: p.firstStatementMonth,
      lastStatementMonth: addMonths(p.firstStatementMonth, p.installmentCount - 1),
      currency: p.currency, usdRateEstimate: p.usdRateEstimate == null ? null : num(p.usdRateEstimate),
      shares: p.shares.map((s) => ({ personId: s.personId, mode: s.mode, value: num(s.value) })),
      shared: !!p.sharedExpenseId,
    }));
  });

  app.post("/api/card-purchases", async (req, reply) => {
    const body = parse(purchaseInput, req.body, reply);
    if (!body) return;
    const card = await prisma.creditCard.findUnique({ where: { id: body.cardId } });
    if (!card) return reply.code(400).send({ error: "Tarjeta inexistente" });
    if (body.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!c || c.type !== "EXPENSE") return reply.code(400).send({ error: "Categoría inválida" });
    }
    const personIds = [...new Set(body.shares.map((s) => s.personId))];
    if (personIds.length !== body.shares.length) return reply.code(400).send({ error: "Persona repetida en el reparto" });
    if ((await prisma.person.count({ where: { id: { in: personIds } } })) !== personIds.length) return reply.code(400).send({ error: "Persona inexistente" });

    // La cotización estimada es solo una ayuda hasta cargar la real; si no vino, se busca y, si no hay, se pide.
    const usdRateEstimate = body.currency === "USD" ? (body.usdRateEstimate ?? (await resolveUsdEstimate(card.id))?.rate) : undefined;
    if (body.currency === "USD" && usdRateEstimate == null) return reply.code(400).send({ error: "No pude obtener la cotización del dólar: ingresala a mano" });

    const first = body.firstStatementMonth ?? (await resolveFirstMonth(card, body.date));
    const amounts = splitInstallments(body.totalAmount, body.installmentCount);
    const months = installmentMonths(first, body.installmentCount);
    const purchase = await prisma.cardPurchase.create({
      data: {
        cardId: card.id, date: toDbDate(body.date), description: body.description, categoryId: body.categoryId ?? null,
        totalAmount: body.totalAmount, installmentCount: body.installmentCount, firstStatementMonth: first,
        currency: body.currency, usdRateEstimate: usdRateEstimate ?? null,
        installments: { create: amounts.map((c, i) => ({ number: i + 1, month: months[i]!, amount: fromCents(c) })) },
        shares: { create: body.shares },
      },
    });
    return reply.code(201).send({ id: purchase.id, firstStatementMonth: first, lastStatementMonth: months[months.length - 1] });
  });

  /** Cambia el mes de resumen de una compra (mueve todas sus cuotas). */
  app.patch<{ Params: { id: string } }>("/api/card-purchases/:id", async (req, reply) => {
    const body = parse(purchasePatch, req.body, reply);
    if (!body) return;
    const purchase = await prisma.cardPurchase.findUnique({ where: { id: req.params.id }, include: { installments: true } });
    if (!purchase) return reply.code(404).send({ error: "Compra no encontrada" });
    const months = installmentMonths(body.firstStatementMonth, purchase.installmentCount);
    await prisma.$transaction([
      prisma.cardPurchase.update({ where: { id: purchase.id }, data: { firstStatementMonth: body.firstStatementMonth } }),
      ...purchase.installments.map((i) => prisma.cardInstallment.update({ where: { id: i.id }, data: { month: months[i.number - 1]! } })),
    ]);
    return { id: purchase.id, firstStatementMonth: body.firstStatementMonth, lastStatementMonth: months[months.length - 1] };
  });

  app.delete<{ Params: { id: string } }>("/api/card-purchases/:id", async (req, reply) => {
    if ((await prisma.cardPurchase.findUnique({ where: { id: req.params.id } }))?.sharedExpenseId)
      return reply.code(409).send({ error: "Es un gasto compartido: editalo desde Compartidos" });
    await prisma.cardPurchase.deleteMany({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  // ---- resumen mensual ----
  app.get<{ Params: { id: string } }>("/api/cards/:id/statement", async (req, reply) => {
    const q = parse(statementQuery, req.query, reply);
    if (!q) return;
    const st = await buildStatement(req.params.id, q.month);
    return st ?? reply.code(404).send({ error: "Tarjeta no encontrada" });
  });

  app.patch<{ Params: { id: string } }>("/api/cards/:id/statement", async (req, reply) => {
    const body = parse(statementPatch, req.body, reply);
    if (!body) return;
    if (!(await prisma.creditCard.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Tarjeta no encontrada" });
    // Con el resumen pagado, lo que cambia el total ya no se toca: el movimiento salió por ese importe.
    const current = await prisma.cardStatement.findUnique({ where: { cardId_month: { cardId: req.params.id, month: body.month } }, select: { paidAt: true } });
    if (current?.paidAt && (body.adjustment !== undefined || body.usdRate !== undefined))
      return reply.code(409).send({ error: "El resumen ya está pagado: deshacé el pago para cambiar la cotización o el ajuste" });
    const { month, closingDate, dueDate, ...amounts } = body;
    const fields = {
      ...amounts,
      ...(closingDate !== undefined && { closingDate: closingDate ? toDbDate(closingDate) : null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? toDbDate(dueDate) : null }),
    };
    await prisma.cardStatement.upsert({
      where: { cardId_month: { cardId: req.params.id, month } },
      create: { cardId: req.params.id, month, ...fields },
      update: fields,
    });
    return buildStatement(req.params.id, month);
  });

  app.post<{ Params: { id: string } }>("/api/cards/:id/statement/pay", async (req, reply) => {
    const body = parse(statementPay, req.body, reply);
    if (!body) return;
    const card = await prisma.creditCard.findUnique({ where: { id: req.params.id } });
    if (!card) return reply.code(404).send({ error: "Tarjeta no encontrada" });
    const st = await buildStatement(card.id, body.month);
    if (!st) return reply.code(404).send({ error: "Tarjeta no encontrada" });
    if (st.paidAt) return reply.code(409).send({ error: "El resumen ya está pagado" });
    if (st.usdSubtotal > 0 && st.usdRate == null) return reply.code(400).send({ error: "Cargá la cotización del dólar del resumen antes de pagarlo" });
    if (st.total <= 0) return reply.code(400).send({ error: "El resumen no tiene importe para pagar" });
    const accountId = body.accountId ?? card.payAccountId;
    if (!accountId || !(await prisma.account.findUnique({ where: { id: accountId } }))) return reply.code(400).send({ error: "Elegí la cuenta desde la que se paga" });

    // Sale de la cuenta el total del resumen; lo que deben los terceros se sigue en Personas.
    await prisma.$transaction(async (tx) => {
      const statement = await tx.cardStatement.upsert({
        where: { cardId_month: { cardId: card.id, month: body.month } },
        create: { cardId: card.id, month: body.month, paidAt: toDbDate(body.date) },
        update: { paidAt: toDbDate(body.date) },
      });
      await tx.transaction.create({
        data: {
          date: toDbDate(body.date), period: body.date.slice(0, 7), amount: st.total, type: "EXPENSE", status: "PAID",
          description: `Resumen ${card.name} ${body.month}`, accountId, statementId: statement.id,
        },
      });
    });
    return buildStatement(card.id, body.month);
  });

  app.delete<{ Params: { id: string } }>("/api/cards/:id/statement/pay", async (req, reply) => {
    const q = parse(statementQuery, req.query, reply);
    if (!q) return;
    const statement = await prisma.cardStatement.findUnique({ where: { cardId_month: { cardId: req.params.id, month: q.month } } });
    if (!statement?.paidAt) return reply.code(404).send({ error: "El resumen no está pagado" });
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { statementId: statement.id } }),
      prisma.cardStatement.update({ where: { id: statement.id }, data: { paidAt: null } }),
    ]);
    return buildStatement(req.params.id, q.month);
  });

  // ---- compromisos futuros: neto propio de cada resumen (sin lo de terceros ni reintegros) ----
  app.get("/api/cards/commitments", async (req, reply) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}$/), months: z.coerce.number().int().min(1).max(36).default(12) }), req.query, reply);
    if (!q) return;
    const range = installmentMonths(q.from, q.months);
    const cards = await prisma.creditCard.findMany({ select: { id: true } });
    return Promise.all(range.map(async (month): Promise<CommitmentDto> => {
      const sts = await Promise.all(cards.map((c) => buildStatement(c.id, month)));
      const byCard = sts.filter((st) => st && st.subtotal > 0).map((st) => ({ cardId: st!.cardId, total: st!.netOwn }));
      return { month, byCard, total: fromCents(byCard.reduce((a, c) => a + toCents(c.total), 0)) };
    }));
  });
}
