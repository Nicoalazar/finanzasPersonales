import type { FastifyInstance } from "fastify";
import { dashboardQuery } from "@finanzas/shared";
import { requireAuth } from "../../plugins/auth.js";
import { parse } from "../../lib.js";
import { buildDashboard } from "./service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/dashboard", async (req, reply) => {
    const q = parse(dashboardQuery, req.query, reply);
    if (!q) return;
    return buildDashboard(q.month, q.months);
  });
}
