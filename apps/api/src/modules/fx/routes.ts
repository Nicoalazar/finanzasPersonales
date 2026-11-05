import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FxQuoteDto } from "@finanzas/shared";
import { requireAuth } from "../../plugins/auth.js";
import { parse } from "../../lib.js";
import { resolveUsdEstimate } from "./service.js";

export async function fxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /** Cotización sugerida para cargar una compra USD en esa tarjeta. Nunca falla: sin datos devuelve rate null y el formulario la pide a mano. */
  app.get("/api/fx/usd", async (req, reply): Promise<FxQuoteDto | undefined> => {
    const q = parse(z.object({ cardId: z.string().min(1) }), req.query, reply);
    if (!q) return;
    const e = await resolveUsdEstimate(q.cardId);
    return { rate: e?.rate ?? null, source: e?.source ?? null, asOf: e?.asOf ?? null };
  });
}
