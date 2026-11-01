import { toCents } from "./money.js";

/** Reparte el total en n cuotas; la última absorbe el redondeo (20000/3 → 666667, 666667, 666666). */
export function splitInstallments(totalAmount: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("count debe ser entero >= 1");
  const total = toCents(totalAmount);
  const base = Math.round(total / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] = total - base * (count - 1);
  return parts;
}

/** Mes (YYYY-MM) del resumen en el que cae una compra, según el día de cierre de la tarjeta. */
export function firstStatementMonth(purchaseDate: Date, closingDay: number): string {
  const y = purchaseDate.getUTCFullYear();
  const m = purchaseDate.getUTCMonth();
  const afterClose = purchaseDate.getUTCDate() > closingDay;
  return addMonths(`${y}-${String(m + 1).padStart(2, "0")}`, afterClose ? 1 : 0);
}

export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Meses de resumen de cada cuota, empezando en firstMonth. */
export function installmentMonths(firstMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(firstMonth, i));
}
