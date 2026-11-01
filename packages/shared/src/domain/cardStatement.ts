import { toCents } from "./money.js";

export interface StatementInput {
  installmentsCents: number[];
  stampTaxRate: number;
  adjustmentCents?: number;
  thirdPartyCents?: number;
  refundsCents?: number;
}

export interface StatementResult {
  subtotalCents: number;
  stampTaxCents: number;
  totalCents: number;
  netOwnCents: number;
}

/** Subtotal + impuesto (7‰) + ajuste = total del resumen; neto propio = total − terceros − reintegros. */
export function computeStatement(i: StatementInput): StatementResult {
  const subtotalCents = i.installmentsCents.reduce((a, b) => a + b, 0);
  const stampTaxCents = Math.round(subtotalCents * i.stampTaxRate);
  const totalCents = subtotalCents + stampTaxCents + (i.adjustmentCents ?? 0);
  const netOwnCents = totalCents - (i.thirdPartyCents ?? 0) - (i.refundsCents ?? 0);
  return { subtotalCents, stampTaxCents, totalCents, netOwnCents };
}

/** Parte de un tercero sobre un monto: porcentaje (0-100) o monto fijo. */
export function shareCents(totalCents: number, share: { mode: "PERCENT" | "AMOUNT"; value: number }): number {
  return share.mode === "PERCENT" ? Math.round((totalCents * share.value) / 100) : toCents(share.value);
}

/** Parte propia de un gasto compartido (Hogar = 35%). */
export const householdShareCents = (totalCents: number, myPercent: number): number =>
  Math.round((totalCents * myPercent) / 100);
