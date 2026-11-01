import type { FastifyInstance } from "fastify";
import type { Transaction } from "@prisma/client";
import { transactionInput, transactionPatch, transactionQuery, type TransactionDto, type MonthSummaryDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { fromDbDate, num, parse, toDbDate } from "../../lib.js";

const dto = (t: Transaction): TransactionDto => ({
  id: t.id, date: fromDbDate(t.date), period: t.period, amount: num(t.amount), type: t.type, status: t.status,
  description: t.description, categoryId: t.categoryId, accountId: t.accountId, toAccountId: t.toAccountId,
});

export async function transactionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/transactions", async (req, reply) => {
    const q = parse(transactionQuery, req.query, reply);
    if (!q) return;
    const rows = await prisma.transaction.findMany({
      where: { period: q.month, type: q.type, categoryId: q.categoryId, status: q.status, ...(q.accountId ? { OR: [{ accountId: q.accountId }, { toAccountId: q.accountId }] } : {}) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const summary: MonthSummaryDto = { income: 0, expense: 0, balance: 0 };
    for (const t of rows) {
      if (t.type === "INCOME") summary.income += num(t.amount);
      else if (t.type === "EXPENSE") summary.expense += num(t.amount);
    }
    summary.income = Math.round(summary.income * 100) / 100;
    summary.expense = Math.round(summary.expense * 100) / 100;
    summary.balance = Math.round((summary.income - summary.expense) * 100) / 100;
    return { items: rows.map(dto), summary };
  });

  /** Valida que cuentas y categoría existan y que la categoría coincida con el tipo del movimiento. */
  async function checkRefs(t: { type: string; categoryId?: string | null; accountId: string; toAccountId?: string | null }): Promise<string | null> {
    const ids = [t.accountId, t.toAccountId].filter((x): x is string => !!x);
    if ((await prisma.account.count({ where: { id: { in: ids } } })) !== new Set(ids).size) return "Cuenta inexistente";
    if (t.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: t.categoryId } });
      if (!c) return "Categoría inexistente";
      if (t.type === "TRANSFER" || c.type !== t.type) return "La categoría no corresponde al tipo de movimiento";
    }
    return null;
  }

  app.post("/api/transactions", async (req, reply) => {
    const body = parse(transactionInput, req.body, reply);
    if (!body) return;
    const err = await checkRefs(body);
    if (err) return reply.code(400).send({ error: err });
    const t = await prisma.transaction.create({
      data: { ...body, date: toDbDate(body.date), period: body.date.slice(0, 7), categoryId: body.categoryId ?? null, toAccountId: body.toAccountId ?? null },
    });
    return reply.code(201).send(dto(t));
  });

  app.patch<{ Params: { id: string } }>("/api/transactions/:id", async (req, reply) => {
    const body = parse(transactionPatch, req.body, reply);
    if (!body) return;
    const cur = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: "Movimiento no encontrado" });
    const merged = { type: body.type ?? cur.type, categoryId: body.categoryId === undefined ? cur.categoryId : body.categoryId, accountId: body.accountId ?? cur.accountId, toAccountId: body.toAccountId === undefined ? cur.toAccountId : body.toAccountId };
    if (merged.type === "TRANSFER" ? !merged.toAccountId || merged.toAccountId === merged.accountId : !!merged.toAccountId) return reply.code(400).send({ error: "Transferencia inválida" });
    const err = await checkRefs(merged);
    if (err) return reply.code(400).send({ error: err });
    const { date, ...rest } = body;
    const t = await prisma.transaction.update({ where: { id: cur.id }, data: { ...rest, ...(date ? { date: toDbDate(date), period: date.slice(0, 7) } : {}) } });
    return dto(t);
  });

  app.delete<{ Params: { id: string } }>("/api/transactions/:id", async (req, reply) => {
    await prisma.transaction.deleteMany({ where: { id: req.params.id } });
    return reply.code(204).send();
  });
}
