import type { FastifyInstance } from "fastify";
import { projectionQuery, projectionSettingsInput, spendingEstimateInput } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { currentMonth, parse } from "../../lib.js";
import { buildProjection } from "./service.js";

export async function projectionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/projection", async (req, reply) => {
    const q = parse(projectionQuery, req.query, reply);
    if (!q) return;
    return buildProjection(q.from ?? currentMonth(), q.months);
  });

  app.put("/api/projection/settings", async (req, reply) => {
    const body = parse(projectionSettingsInput, req.body, reply);
    if (!body) return;
    await prisma.projectionSettings.upsert({ where: { id: "default" }, create: { id: "default", ...body }, update: body });
    return reply.code(204).send();
  });

  /** Monto mensual propio de una categoría: reemplaza al promedio en la proyección. */
  app.put("/api/projection/estimates", async (req, reply) => {
    const body = parse(spendingEstimateInput, req.body, reply);
    if (!body) return;
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!cat || cat.type !== "EXPENSE") return reply.code(400).send({ error: "El monto va sobre una categoría de gastos" });
    await prisma.spendingEstimate.upsert({ where: { categoryId: body.categoryId }, create: body, update: { amount: body.amount } });
    return reply.code(204).send();
  });

  app.delete<{ Params: { categoryId: string } }>("/api/projection/estimates/:categoryId", async (req, reply) => {
    await prisma.spendingEstimate.deleteMany({ where: { categoryId: req.params.categoryId } });
    return reply.code(204).send();
  });
}
