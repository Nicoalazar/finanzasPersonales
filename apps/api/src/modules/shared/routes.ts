import type { FastifyInstance, FastifyReply } from "fastify";
import {
  parseFormCsv, sharedConfigInput, sharedEntryInput, sharedEntryPatch, sharedImportInput, sharedKindInput, sharedMonthQuery, sharedSettleInput,
  type SharedConfigDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { parse, toDbDate } from "../../lib.js";
import { reimbursementCategoryId } from "../persons/service.js";
import { buildSharedMonth, entryDto, getLedger, importRows, syncPayment } from "./service.js";

const configDto = (l: Awaited<ReturnType<typeof getLedger>>): SharedConfigDto => ({
  meName: l.meName, partnerName: l.partnerName, sourceUrl: l.sourceUrl, fromMonth: l.fromMonth,
  defaultAccountId: l.defaultAccountId, groupId: l.groupId, lastSyncAt: l.lastSyncAt?.toISOString() ?? null,
});

/** Valida cuenta y tarjeta del pago; devuelve el mensaje de error o null. */
async function checkMethod(b: { accountId?: string | null; cardId?: string | null }): Promise<string | null> {
  if (b.accountId && !(await prisma.account.findUnique({ where: { id: b.accountId } }))) return "Cuenta inexistente";
  if (b.cardId && !(await prisma.creditCard.findUnique({ where: { id: b.cardId } }))) return "Tarjeta inexistente";
  return null;
}

export async function sharedRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  const bad = (reply: FastifyReply, msg: string) => reply.code(400).send({ error: msg });

  app.get("/api/shared/config", async () => configDto(await getLedger()));

  app.patch("/api/shared/config", async (req, reply) => {
    const body = parse(sharedConfigInput, req.body, reply);
    if (!body) return;
    if (body.defaultAccountId && !(await prisma.account.findUnique({ where: { id: body.defaultAccountId } }))) return bad(reply, "Cuenta inexistente");
    if (body.groupId && !(await prisma.sharedGroup.findUnique({ where: { id: body.groupId } }))) return bad(reply, "Grupo inexistente");
    const before = await getLedger();
    const l = await prisma.sharedLedger.update({ where: { id: "default" }, data: body });
    // al cambiar la cuenta por defecto, mis pagos que la usaban pasan a la nueva
    if (body.defaultAccountId !== undefined && body.defaultAccountId !== before.defaultAccountId) {
      const mine = await prisma.sharedExpense.findMany({ where: { payer: "ME", accountId: null, cardId: null, ignored: false } });
      for (const e of mine) await syncPayment(e, l.defaultAccountId);
    }
    return configDto(l);
  });

  app.get("/api/shared/month", async (req, reply) => {
    const q = parse(sharedMonthQuery, req.query, reply);
    if (!q) return;
    return buildSharedMonth(q.month);
  });

  /** Importa las respuestas del formulario: del CSV enviado o, si no viene, del CSV publicado configurado. */
  app.post("/api/shared/import", { bodyLimit: 6_000_000 }, async (req, reply) => {
    const body = parse(sharedImportInput, req.body ?? {}, reply);
    if (!body) return;
    const ledger = await getLedger();
    let csv = body.csv;
    if (csv == null) {
      if (!ledger.sourceUrl) return bad(reply, "Configurá el link del CSV publicado o subí el archivo");
      try {
        const res = await fetch(ledger.sourceUrl, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) return reply.code(502).send({ error: `La planilla respondió ${res.status}` });
        csv = await res.text();
      } catch {
        return reply.code(502).send({ error: "No pude descargar la planilla" });
      }
      if (/^\s*</.test(csv)) return reply.code(502).send({ error: "El link no devuelve un CSV: publicá la hoja de respuestas como CSV" });
    }
    const { rows, errors } = parseFormCsv(csv, { me: ledger.meName, partner: ledger.partnerName });
    if (rows.length === 0 && errors.length > 0) return reply.code(400).send({ error: "No pude leer ninguna fila", errors: errors.slice(0, 20) });
    return importRows(rows, errors.slice(0, 50));
  });

  app.post("/api/shared/entries", async (req, reply) => {
    const body = parse(sharedEntryInput, req.body, reply);
    if (!body) return;
    const err = await checkMethod(body);
    if (err) return bad(reply, err);
    const e = await prisma.sharedExpense.create({
      data: {
        date: toDbDate(body.date), month: body.date.slice(0, 7), payer: body.payer, kind: body.kind, description: body.description, amount: body.amount,
        accountId: body.accountId ?? null, cardId: body.cardId ?? null, installmentCount: body.cardId ? (body.installmentCount ?? 1) : 1,
      },
    });
    await syncPayment(e, (await getLedger()).defaultAccountId);
    return reply.code(201).send(entryDto(e));
  });

  app.patch<{ Params: { id: string } }>("/api/shared/entries/:id", async (req, reply) => {
    const body = parse(sharedEntryPatch, req.body, reply);
    if (!body) return;
    const cur = await prisma.sharedExpense.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: "Gasto no encontrado" });
    const err = await checkMethod(body);
    if (err) return bad(reply, err);
    const { date, cardId, installmentCount, ...rest } = body;
    const nextCard = cardId === undefined ? cur.cardId : cardId;
    const e = await prisma.sharedExpense.update({
      where: { id: cur.id },
      data: {
        ...rest, ...(date ? { date: toDbDate(date), month: date.slice(0, 7) } : {}),
        cardId: nextCard, installmentCount: nextCard ? (installmentCount ?? cur.installmentCount) : 1,
        // pagar con tarjeta y desde una cuenta se excluyen
        ...(cardId ? { accountId: null } : {}), ...(body.accountId ? { cardId: null, installmentCount: 1 } : {}),
      },
    });
    await syncPayment(e, (await getLedger()).defaultAccountId);
    return entryDto(e);
  });

  /** Lo cargado a mano se borra; lo del formulario queda ignorado para que no vuelva al reimportar. */
  app.delete<{ Params: { id: string } }>("/api/shared/entries/:id", async (req, reply) => {
    const cur = await prisma.sharedExpense.findUnique({ where: { id: req.params.id } });
    if (cur?.source === "FORM") {
      const e = await prisma.sharedExpense.update({ where: { id: cur.id }, data: { ignored: true } });
      await syncPayment(e, null);
    } else await prisma.sharedExpense.deleteMany({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  /** Elige la categoría de un tipo del formulario y la aplica a lo ya generado. */
  app.put("/api/shared/kinds", async (req, reply) => {
    const body = parse(sharedKindInput, req.body, reply);
    if (!body) return;
    if (body.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!c || c.type !== "EXPENSE") return bad(reply, "La categoría debe ser de gastos");
    }
    await prisma.$transaction([
      prisma.sharedKind.upsert({ where: { kind: body.kind }, create: body, update: { categoryId: body.categoryId } }),
      prisma.transaction.updateMany({ where: { sharedExpense: { kind: body.kind } }, data: { categoryId: body.categoryId } }),
      prisma.cardPurchase.updateMany({ where: { sharedExpense: { kind: body.kind } }, data: { categoryId: body.categoryId } }),
    ]);
    return { ok: true };
  });

  /** Registra el saldo del mes: positivo si la pareja me pagó (reintegro), negativo si le pagué yo. */
  app.post("/api/shared/settle", async (req, reply) => {
    const body = parse(sharedSettleInput, req.body, reply);
    if (!body) return;
    if (!(await prisma.account.findUnique({ where: { id: body.accountId } }))) return bad(reply, "Cuenta inexistente");
    const ledger = await getLedger();
    const incoming = body.amount > 0;
    const t = await prisma.transaction.create({
      data: {
        date: toDbDate(body.date), period: body.date.slice(0, 7), amount: Math.abs(body.amount), type: incoming ? "INCOME" : "EXPENSE", status: "PAID",
        description: `Gastos compartidos ${body.month} · ${incoming ? `pagó ${ledger.partnerName}` : `pagué a ${ledger.partnerName}`}`,
        categoryId: incoming ? await reimbursementCategoryId() : null, accountId: body.accountId, sharedMonth: body.month,
      },
    });
    return reply.code(201).send({ transactionId: t.id });
  });

  app.delete<{ Params: { id: string } }>("/api/shared/settlements/:id", async (req, reply) => {
    await prisma.transaction.deleteMany({ where: { id: req.params.id, sharedMonth: { not: null } } });
    return reply.code(204).send();
  });
}
