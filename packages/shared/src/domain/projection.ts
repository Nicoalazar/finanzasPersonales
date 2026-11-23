/** Meses de `from` a `to` (YYYY-MM); negativo si `to` es anterior. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

/** Aplica `pct` % mensual compuesto durante `months` meses (0 o menos: sin cambio), redondeando al centavo. */
export function inflateCents(cents: number, pct: number, months: number): number {
  return months <= 0 || pct === 0 ? cents : Math.round(cents * (1 + pct / 100) ** months);
}

/** Mes en que se paga el aguinaldo (junio y diciembre). */
export const isSacMonth = (month: string): boolean => month.endsWith("-06") || month.endsWith("-12");
