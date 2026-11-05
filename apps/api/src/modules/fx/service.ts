import { config } from "../../config.js";
import { num } from "../../lib.js";
import { prisma } from "../../plugins/db.js";

export interface Quote { rate: number; updatedAt: string | null }

const TTL_OK = 60 * 60 * 1000;
const TTL_FAIL = 60 * 1000;
let cache: { at: number; value: Quote | null } | null = null;

/** Solo para tests: olvida la cotización cacheada. */
export const resetFxCache = () => { cache = null; };

/** Dólar oficial (punta vendedora, la que usa el banco). La API pública es solo una ayuda: cualquier falla devuelve null. */
export function parseQuote(body: unknown): Quote | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const venta = Number(b.venta);
  if (!Number.isFinite(venta) || venta <= 0 || venta > 1_000_000) return null;
  return { rate: Math.round(venta * 10_000) / 10_000, updatedAt: typeof b.fechaActualizacion === "string" ? b.fechaActualizacion : null };
}

export async function fetchOfficialUsd(): Promise<Quote | null> {
  if (cache && Date.now() - cache.at < (cache.value ? TTL_OK : TTL_FAIL)) return cache.value;
  let value: Quote | null = null;
  try {
    const res = await fetch(config.FX_API_URL, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (res.ok) value = parseQuote(await res.json());
  } catch {
    value = null;
  }
  cache = { at: Date.now(), value };
  return value;
}

export interface UsdEstimate { rate: number; source: "api" | "statement"; asOf: string | null }

/** Cotización para estimar una compra USD: la API y, si no responde, la última real cargada en un resumen de esa tarjeta. */
export async function resolveUsdEstimate(cardId: string): Promise<UsdEstimate | null> {
  const quote = await fetchOfficialUsd();
  if (quote) return { rate: quote.rate, source: "api", asOf: quote.updatedAt };
  const last = await prisma.cardStatement.findFirst({
    where: { cardId, usdRate: { not: null } }, orderBy: { month: "desc" }, select: { usdRate: true, month: true },
  });
  return last ? { rate: num(last.usdRate), source: "statement", asOf: last.month } : null;
}
