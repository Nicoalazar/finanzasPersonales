import type { FastifyInstance, FastifyReply } from "fastify";
import {
  fromCents, generateInput, occursIn, percentAt, recurringInput, recurringListQuery, recurringPatch, recurringPriceInput,
  sharedGroupInput, sharedGroupPercentInput, yearMonth,
  type RecurringDto, type SharedGroupDto,
} from "@finanzas/shared";
import { z } from "zod";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { currentMonth, num, parse } from "../../lib.js";
import { generateMonth, groupPercentOf, loadRecurring, myCents, priceOf, type LoadedRecurring } from "./service.js";

const dto = (r: LoadedRecurring, month: string): RecurringDto => ({
  id: r.id, name: r.name, categoryId: r.categoryId, frequency: r.frequency, accountId: r.accountId, sharedGroupId: r.sharedGroupId,
  startMonth: r.startMonth, endMonth: r.endMonth, dayOfMonth: r.dayOfMonth,
  prices: r.prices.map((p) => ({ fromMonth: p.fromMonth, amount: num(p.amount) })).sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)),
  shares: r.shares.map((s) => ({ personId: s.personId, mode: s.mode, value: num(s.value) })),
  occursThisMonth: occursIn(r, month), price: priceOf(r, month), groupPercent: groupPercentOf(r, month), myAmount: fromCents(myCents(r, month)),
});

/** Valida referencias; devuelve el mensaje de error o null. */
async function checkRefs(b: { accountId?: string | null; categoryId?: string | null; sharedGroupId?: string | null; shares?: { personId: string; mode: string; value: number }[] }): Promise<string | null> {
  if (b.accountId && !(await prisma.account.findUnique({ where: { id: b.accountId } }))) return "Cuenta inexistente";
  if (b.categoryId) {
    const c = await prisma.category.findUnique({ where: { id: b.categoryId } });
    if (!c || c.type !== "EXPENSE") return "La categoría debe ser de gastos";
  }
  if (b.sharedGroupId && !(await prisma.sharedGroup.findUnique({ where: { id: b.sharedGroupId } }))) return "Grupo inexistente";
  if (b.shares?.length) {
    const ids = [...new Set(b.shares.map((s) => s.personId))];
    if (ids.length !== b.shares.length) return "Persona repetida en el reparto";
    if ((await prisma.person.count({ where: { id: { in: ids } } })) !== ids.length) return "Persona inexistente";
    if (b.shares.some((s) => s.mode === "PERCENT" && s.value > 100) || b.shares.filter((s) => s.mode === "PERCENT").reduce((a, s) => a + s.value, 0) > 100) return "Los porcentajes repartidos superan 100";
  }
  return null;
}

export async function recurringRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  const bad = (reply: FastifyReply, msg: string) => reply.code(400).send({ error: msg });

  app.get("/api/recurring", async (req, reply) => {
    const q = parse(recurringListQuery, req.query, reply);
    if (!q) return;
    const month = q.month ?? currentMonth();
    return (await loadRecurring()).map((r) => dto(r, month));
  });

  app.post("/api/recurring", async (req, reply) => {
    const body = parse(recurringInput, req.body, reply);
    if (!body) return;
    if (body.endMonth && body.endMonth < body.startMonth) return bad(reply, "El fin es anterior al inicio");
    const err = await checkRefs(body);
    if (err) return bad(reply, err);
    const { amount, shares, ...rest } = body;
    const r = await prisma.recurringExpense.create({
      data: { ...rest, prices: { create: { fromMonth: body.startMonth, amount } }, shares: { create: shares } },
    });
    return reply.code(201).send({ id: r.id });
  });

  app.patch<{ Params: { id: string } }>("/api/recurring/:id", async (req, reply) => {
    const body = parse(recurringPatch, req.body, reply);
    if (!body) return;
    const current = await prisma.recurringExpense.findUnique({ where: { id: req.params.id } });
    if (!current) return reply.code(404).send({ error: "Recurrente no encontrado" });
    const err = await checkRefs(body);
    if (err) return bad(reply, err);
    const { shares, ...rest } = body;
    const accountChanged = !!body.accountId && body.accountId !== current.accountId;
    await prisma.$transaction([
      ...(shares ? [prisma.personShare.deleteMany({ where: { recurringId: req.params.id } })] : []),
      // Los pendientes ya generados pasan a la cuenta nueva (aunque tengan el monto editado); lo pagado no se toca.
      ...(accountChanged ? [prisma.transaction.updateMany({ where: { recurringId: req.params.id, status: "PENDING" }, data: { accountId: body.accountId! } })] : []),
      prisma.recurringExpense.update({ where: { id: req.params.id }, data: { ...rest, ...(shares ? { shares: { create: shares } } : {}) } }),
    ]);
    return { id: req.params.id };
  });

  /** Borra el recurrente y sus pendientes; los movimientos ya pagados quedan como movimientos comunes. */
  app.delete<{ Params: { id: string } }>("/api/recurring/:id", async (req, reply) => {
    const id = req.params.id;
    await prisma.$transaction([
      prisma.transaction.updateMany({ where: { recurringId: id, status: "PAID" }, data: { recurringId: null } }),
      prisma.transaction.deleteMany({ where: { recurringId: id } }),
      prisma.recurringExpense.deleteMany({ where: { id } }),
    ]);
    return reply.code(204).send();
  });

  app.put<{ Params: { id: string } }>("/api/recurring/:id/prices", async (req, reply) => {
    const body = parse(recurringPriceInput, req.body, reply);
    if (!body) return;
    if (!(await prisma.recurringExpense.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Recurrente no encontrado" });
    await prisma.recurringPriceChange.upsert({
      where: { recurringId_fromMonth: { recurringId: req.params.id, fromMonth: body.fromMonth } },
      create: { recurringId: req.params.id, ...body },
      update: { amount: body.amount },
    });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; fromMonth: string } }>("/api/recurring/:id/prices/:fromMonth", async (req, reply) => {
    if (!yearMonth.safeParse(req.params.fromMonth).success) return bad(reply, "Mes inválido");
    if ((await prisma.recurringPriceChange.count({ where: { recurringId: req.params.id } })) <= 1) return reply.code(409).send({ error: "Tiene que quedar al menos un precio" });
    await prisma.recurringPriceChange.deleteMany({ where: { recurringId: req.params.id, fromMonth: req.params.fromMonth } });
    return reply.code(204).send();
  });

  app.post("/api/recurring/generate", async (req, reply) => {
    const body = parse(generateInput, req.body, reply);
    if (!body) return;
    return generateMonth(body.month);
  });

  // ---- grupos compartidos (Hogar) ----
  const groupDto = (g: { id: string; name: string; myPercent: unknown; overrides: { month: string; percent: unknown }[] }, month: string): SharedGroupDto => {
    const overrides = g.overrides.map((o) => ({ month: o.month, percent: num(o.percent as { toString(): string }) })).sort((a, b) => a.month.localeCompare(b.month));
    const base = num(g.myPercent as { toString(): string });
    return { id: g.id, name: g.name, myPercent: base, overrides, percent: percentAt(base, overrides, month), percentIsOwn: overrides.some((o) => o.month === month) };
  };

  app.get("/api/shared-groups", async (req, reply) => {
    const q = parse(recurringListQuery, req.query, reply);
    if (!q) return;
    const groups = await prisma.sharedGroup.findMany({ include: { overrides: true }, orderBy: { name: "asc" } });
    return groups.map((g) => groupDto(g, q.month ?? currentMonth()));
  });

  app.post("/api/shared-groups", async (req, reply) => {
    const body = parse(sharedGroupInput, req.body, reply);
    if (!body) return;
    if (await prisma.sharedGroup.findUnique({ where: { name: body.name } })) return reply.code(409).send({ error: "Ya existe un grupo con ese nombre" });
    const g = await prisma.sharedGroup.create({ data: body, include: { overrides: true } });
    return reply.code(201).send(groupDto(g, currentMonth()));
  });

  app.patch<{ Params: { id: string } }>("/api/shared-groups/:id", async (req, reply) => {
    const body = parse(sharedGroupInput.partial(), req.body, reply);
    if (!body) return;
    if (!(await prisma.sharedGroup.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Grupo no encontrado" });
    const g = await prisma.sharedGroup.update({ where: { id: req.params.id }, data: body, include: { overrides: true } });
    return groupDto(g, currentMonth());
  });

  /** Fija el % de un mes (y de los siguientes hasta el próximo mes con valor propio). */
  app.put<{ Params: { id: string } }>("/api/shared-groups/:id/percent", async (req, reply) => {
    const body = parse(sharedGroupPercentInput, req.body, reply);
    if (!body) return;
    if (!(await prisma.sharedGroup.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Grupo no encontrado" });
    await prisma.sharedGroupPercent.upsert({
      where: { groupId_month: { groupId: req.params.id, month: body.month } },
      create: { groupId: req.params.id, ...body },
      update: { percent: body.percent },
    });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; month: string } }>("/api/shared-groups/:id/percent/:month", async (req, reply) => {
    if (!z.string().regex(/^\d{4}-\d{2}$/).safeParse(req.params.month).success) return bad(reply, "Mes inválido");
    await prisma.sharedGroupPercent.deleteMany({ where: { groupId: req.params.id, month: req.params.month } });
    return reply.code(204).send();
  });
}
