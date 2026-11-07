import { toCents } from "./money.js";

export interface StatementInput {
  /** cuotas en pesos */
  installmentsCents: number[];
  /** consumos en USD ya pasados a pesos: no pagan el impuesto de sellos */
  usdArsCents?: number;
  stampTaxRate: number;
  adjustmentCents?: number;
  thirdPartyCents?: number;
  refundsCents?: number;
}

export interface StatementResult {
  subtotalCents: number;
  stampTaxCents: number;
  /** subtotal en pesos + impuesto + ajuste */
  arsTotalCents: number;
  /** lo que se paga: total en pesos + consumos en USD en pesos */
  totalCents: number;
  netOwnCents: number;
}

/**
 * Como el resumen del banco: subtotal en pesos + impuesto (7‰ sobre los pesos) + ajuste = total en pesos;
 * + consumos en USD a la cotización del resumen = total a pagar; neto propio = total − terceros − reintegros.
 */
export function computeStatement(i: StatementInput): StatementResult {
  const subtotalCents = i.installmentsCents.reduce((a, b) => a + b, 0);
  const stampTaxCents = Math.round(subtotalCents * i.stampTaxRate);
  const arsTotalCents = subtotalCents + stampTaxCents + (i.adjustmentCents ?? 0);
  const totalCents = arsTotalCents + (i.usdArsCents ?? 0);
  const netOwnCents = totalCents - (i.thirdPartyCents ?? 0) - (i.refundsCents ?? 0);
  return { subtotalCents, stampTaxCents, arsTotalCents, totalCents, netOwnCents };
}

/** Parte de un tercero sobre un monto: porcentaje (0-100) o monto fijo. */
export function shareCents(totalCents: number, share: { mode: "PERCENT" | "AMOUNT"; value: number }): number {
  return share.mode === "PERCENT" ? Math.round((totalCents * share.value) / 100) : toCents(share.value);
}

/** Parte propia de un gasto compartido (Hogar = 35%). */
export const householdShareCents = (totalCents: number, myPercent: number): number =>
  Math.round((totalCents * myPercent) / 100);

export type Currency = "ARS" | "USD";

/**
 * Pesos que vale una cuota. Las de ARS no se convierten. Las de USD usan la cotización real del resumen y,
 * mientras no esté cargada, la estimada que quedó en la compra (`estimated` avisa que el número va a moverse).
 * Es el único lugar donde se convierte: resumen, personas y presupuestos pasan por acá.
 */
export function installmentArsCents(
  i: { currency: Currency; amountCents: number; estimateRate: number | null },
  statementRate: number | null,
): { cents: number; rate: number | null; estimated: boolean } {
  if (i.currency === "ARS") return { cents: i.amountCents, rate: null, estimated: false };
  const rate = statementRate ?? i.estimateRate;
  if (rate == null || !(rate > 0)) throw new Error("Una compra en USD necesita cotización");
  return { cents: Math.round(i.amountCents * rate), rate, estimated: statementRate == null };
}
