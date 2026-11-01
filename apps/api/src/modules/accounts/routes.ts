import type { FastifyInstance } from "fastify";
import type { Account } from "@prisma/client";
import { accountInput, accountPatch, type AccountDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { num, parse } from "../../lib.js";
import { accountBalances } from "./service.js";

const dto = (a: Account, delta: number): AccountDto => ({
  id: a.id, name: a.name, kind: a.kind, archived: a.archived,
  initialBalance: num(a.initialBalance), balance: Math.round((num(a.initialBalance) + delta) * 100) / 100,
});

export async function accountRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/accounts", async () => {
    const [accounts, bal] = await Promise.all([prisma.account.findMany({ orderBy: { name: "asc" } }), accountBalances()]);
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
    return dto(a, (await accountBalances()).get(a.id) ?? 0);
  });
}
