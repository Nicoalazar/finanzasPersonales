export type BudgetStatus = "NONE" | "OK" | "WARN" | "OVER";

export const WARN_AT = 0.8;
export const OVER_AT = 1;

/** Avance del presupuesto: WARN desde el 80 %, OVER al llegar al 100 %. Sin presupuesto (o en 0) no hay estado. */
export function budgetStatus(spentCents: number, budgetCents: number | null): { pct: number | null; status: BudgetStatus } {
  if (budgetCents == null || budgetCents <= 0) return { pct: null, status: "NONE" };
  const ratio = spentCents / budgetCents;
  return { pct: Math.round(ratio * 1000) / 10, status: ratio >= OVER_AT ? "OVER" : ratio >= WARN_AT ? "WARN" : "OK" };
}

/** Sube (o baja) un monto un porcentaje, redondeando al centavo. */
export const increaseCents = (cents: number, percent: number): number => Math.round(cents * (1 + percent / 100));
