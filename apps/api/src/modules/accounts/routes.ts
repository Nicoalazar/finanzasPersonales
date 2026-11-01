import type { FastifyInstance } from "fastify";
import type { Account } from "@prisma/client";
import { accountInput, accountPatch, type AccountDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { num, parse } from "../../lib.js";

/** Saldo = inicial + ingresos − gastos − transferencias salientes + entrantes (solo PAID). */
async function balances(): Promise<Map<string, number>> {
  const [byAccount, incoming] = await Promise.all([
    prisma.transaction.groupBy({ by: ["accountId", "type"], where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["toAccountId"], where: { status: "PAID", type: "TRANSFER" }, _sum: { amount: true } }),
  ]);
  const m = new Map<string, number>();
  const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  for (const r of byAccount) add(r.accountId, (r.type === "INCOME" ? 1 : -1) * num(r._sum.amount));
  for (const r of incoming) if (r.toAccountId) add(r.toAccountId, num(r._sum.amount));
  return m;
}

const dto = (a: Account, delta: number): AccountDto => ({
  id: a.id, name: a.name, kind: a.kind, archived: a.archived,
  initialBalance: num(a.initialBalance), balance: Math.round((num(a.initialBalance) + delta) * 100) / 100,
});

export async function accountRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/accounts", async () => {
    const [accounts, bal] = await Promise.all([prisma.account.findMany({ orderBy: { name: "asc" } }), balances()]);
    return accounts.map((a) => dto(a, bal.get(a.id) ?? 0));
  });

  app.post("/api/accounts", async (req, reply) => {
    const body = parse(accountInput, req.body, reply);
    if (!body) return;
    const a = await prisma.account.create({ data: body });
    return reply.code(201).send(dto(a, 0));
  });

  app.patch<{ Params: { id: string } }>("/api/accounts/:id", async (req, reply) => {
    const body = parse(accountPatch, req.body, reply);
    if (!body) return;
    const exists = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!exists) return reply.code(404).send({ error: "Cuenta no encontrada" });
    const a = await prisma.account.update({ where: { id: req.params.id }, data: body });
    return dto(a, (await balances()).get(a.id) ?? 0);
  });
}
