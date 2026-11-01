import type { FastifyInstance } from "fastify";
import { investmentMovementInput, snapshotInput } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { parse, toDbDate } from "../../lib.js";
import { buildInvestments } from "./service.js";

export async function investmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/investments", async () => buildInvestments());

  async function investmentAccount(id: string) {
    const a = await prisma.account.findUnique({ where: { id } });
    return a?.kind === "INVESTMENT" ? a : null;
  }

  /** Anotar el saldo real a una fecha; si ya había uno ese día, se reemplaza. */
  app.post("/api/investments/snapshots", async (req, reply) => {
    const body = parse(snapshotInput, req.body, reply);
    if (!body) return;
    if (!(await investmentAccount(body.accountId))) return reply.code(400).send({ error: "La cuenta tiene que ser de tipo Inversión" });
    const s = await prisma.balanceSnapshot.upsert({
      where: { accountId_date: { accountId: body.accountId, date: toDbDate(body.date) } },
      create: { accountId: body.accountId, date: toDbDate(body.date), balance: body.balance },
      update: { balance: body.balance },
    });
    return reply.code(201).send({ id: s.id });
  });

  app.delete<{ Params: { id: string } }>("/api/investments/snapshots/:id", async (req, reply) => {
    await prisma.balanceSnapshot.deleteMany({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  /** Depósito o retiro: se guarda como transferencia para que los saldos de las cuentas sigan cuadrando. */
  app.post("/api/investments/movements", async (req, reply) => {
    const body = parse(investmentMovementInput, req.body, reply);
    if (!body) return;
    const inv = await investmentAccount(body.accountId);
    if (!inv) return reply.code(400).send({ error: "La cuenta tiene que ser de tipo Inversión" });
    if (body.otherAccountId === body.accountId) return reply.code(400).send({ error: "Elegí una cuenta distinta" });
    const other = await prisma.account.findUnique({ where: { id: body.otherAccountId } });
    if (!other) return reply.code(400).send({ error: "Cuenta inexistente" });

    const deposit = body.kind === "DEPOSIT";
    const t = await prisma.transaction.create({
      data: {
        date: toDbDate(body.date), period: body.date.slice(0, 7), amount: body.amount, type: "TRANSFER", status: "PAID",
        accountId: deposit ? other.id : inv.id, toAccountId: deposit ? inv.id : other.id,
        description: deposit ? `Depósito a ${inv.name}` : `Retiro de ${inv.name}`,
      },
    });
    return reply.code(201).send({ id: t.id });
  });
}
