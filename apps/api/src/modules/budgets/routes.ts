import type { FastifyInstance } from "fastify";
import { budgetCopyInput, budgetInput, budgetQuery, fromCents, increaseCents, toCents, yearMonth } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { num, parse } from "../../lib.js";
import { buildBudgets } from "./service.js";

export async function budgetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/budgets", async (req, reply) => {
    const q = parse(budgetQuery, req.query, reply);
    if (!q) return;
    return buildBudgets(q.month);
  });

  app.put("/api/budgets", async (req, reply) => {
    const body = parse(budgetInput, req.body, reply);
    if (!body) return;
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!cat || cat.type !== "EXPENSE") return reply.code(400).send({ error: "El presupuesto va sobre una categoría de gastos" });
    await prisma.budget.upsert({
      where: { categoryId_month: { categoryId: body.categoryId, month: body.month } },
      create: body, update: { amount: body.amount },
    });
    return buildBudgets(body.month);
  });

  app.delete<{ Params: { categoryId: string; month: string } }>("/api/budgets/:categoryId/:month", async (req, reply) => {
    if (!yearMonth.safeParse(req.params.month).success) return reply.code(400).send({ error: "Mes inválido" });
    await prisma.budget.deleteMany({ where: { categoryId: req.params.categoryId, month: req.params.month } });
    return reply.code(204).send();
  });

  /** Copia los presupuestos de un mes a otro aplicando un aumento; por defecto no pisa los ya cargados. */
  app.post("/api/budgets/copy", async (req, reply) => {
    const body = parse(budgetCopyInput, req.body, reply);
    if (!body) return;
    const [source, existing] = await Promise.all([
      prisma.budget.findMany({ where: { month: body.fromMonth } }),
      prisma.budget.findMany({ where: { month: body.toMonth } }),
    ]);
    const taken = new Set(existing.map((b) => b.categoryId));
    const todo = source.filter((b) => body.overwrite || !taken.has(b.categoryId));
    await prisma.$transaction(
      todo.map((b) => {
        const amount = fromCents(increaseCents(toCents(num(b.amount)), body.increasePercent));
        return prisma.budget.upsert({
          where: { categoryId_month: { categoryId: b.categoryId, month: body.toMonth } },
          create: { categoryId: b.categoryId, month: body.toMonth, amount }, update: { amount },
        });
      }),
    );
    return { copied: todo.length, skipped: source.length - todo.length };
  });
}
