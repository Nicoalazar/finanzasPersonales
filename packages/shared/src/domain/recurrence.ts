import { addMonths } from "./installments.js";

export type Frequency = "MONTHLY" | "BIMONTHLY" | "YEARLY";
const STEP: Record<Frequency, number> = { MONTHLY: 1, BIMONTHLY: 2, YEARLY: 12 };

const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
};

/** ¿El recurrente corresponde al mes? Cuenta desde startMonth según la frecuencia y respeta endMonth. */
export function occursIn(r: { frequency: Frequency; startMonth: string; endMonth?: string | null }, month: string): boolean {
  if (month < r.startMonth || (r.endMonth && month > r.endMonth)) return false;
  return (monthIndex(month) - monthIndex(r.startMonth)) % STEP[r.frequency] === 0;
}

/** Valor vigente en el mes: el del último cambio con fromMonth <= month (0 si todavía no hay ninguno). */
export function valueAt<T extends { fromMonth: string }>(changes: T[], month: string): T | undefined {
  return changes.filter((c) => c.fromMonth <= month).sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)).at(-1);
}

export const priceAt = (prices: { fromMonth: string; amount: number }[], month: string): number => valueAt(prices, month)?.amount ?? 0;

/** Porcentaje del grupo en el mes: el último cargado hasta ese mes (se hereda hacia adelante) o el base. */
export function percentAt(basePercent: number, overrides: { month: string; percent: number }[], month: string): number {
  const o = overrides.filter((x) => x.month <= month).sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  return o ? o.percent : basePercent;
}

/** Mis centavos de un recurrente en un mes: precio vigente × % del grupo (si tiene). */
export function recurringCents(priceCents: number, groupPercent: number | null): number {
  return groupPercent == null ? priceCents : Math.round((priceCents * groupPercent) / 100);
}

/** Próximos `count` meses en que ocurre, desde `from`. */
export function nextOccurrences(r: Parameters<typeof occursIn>[0], from: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 120 && out.length < count; i++) if (occursIn(r, addMonths(from, i))) out.push(addMonths(from, i));
  return out;
}
