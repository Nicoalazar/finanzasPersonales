import type { FastifyInstance } from "fastify";
import { spendingQuery } from "@finanzas/shared";
import { requireAuth } from "../../plugins/auth.js";
import { parse } from "../../lib.js";
import { buildSpending } from "./service.js";

export async function spendingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /** Gasto propio del mes por categoría. */
  app.get("/api/spending", async (req, reply) => {
    const q = parse(spendingQuery, req.query, reply);
    if (!q) return;
    return buildSpending(q.month);
  });
}
