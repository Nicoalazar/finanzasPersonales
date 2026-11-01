/** Movimiento de plata hacia (+) o desde (−) la cuenta de inversión, en centavos. */
export interface Flow { date: string; cents: number }
export interface Snapshot { id: string; date: string; balanceCents: number }

export interface InvestmentRow {
  id: string; date: string;
  theoreticalCents: number; realCents: number;
  /** real − teórico: ganancia acumulada a esa fecha */
  gainCents: number;
  /** ganancia desde la anotación anterior */
  periodGainCents: number;
  /** ganancia del período sobre el saldo con el que arrancó (anterior + aportes del período) */
  returnPct: number | null;
}

const sumUpTo = (flows: Flow[], date: string) => flows.filter((f) => f.date <= date).reduce((a, f) => a + f.cents, 0);

/** Saldo teórico a una fecha: inicial + depósitos − retiros hasta ese día. */
export const theoreticalAt = (initialCents: number, flows: Flow[], date: string) => initialCents + sumUpTo(flows, date);

/** Una fila por saldo real anotado (orden ascendente por fecha). */
export function investmentRows(initialCents: number, flows: Flow[], snapshots: Snapshot[]): InvestmentRow[] {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const rows: InvestmentRow[] = [];
  for (const [i, s] of sorted.entries()) {
    const prev = i > 0 ? rows[i - 1]! : null;
    const theoreticalCents = theoreticalAt(initialCents, flows, s.date);
    const gainCents = s.balanceCents - theoreticalCents;
    const periodGainCents = gainCents - (prev?.gainCents ?? 0);
    const flowsInPeriod = prev ? sumUpTo(flows, s.date) - sumUpTo(flows, prev.date) : sumUpTo(flows, s.date);
    const base = (prev ? prev.realCents : initialCents) + flowsInPeriod;
    rows.push({
      id: s.id, date: s.date, theoreticalCents, realCents: s.balanceCents, gainCents, periodGainCents,
      returnPct: base > 0 ? Math.round((periodGainCents / base) * 10000) / 100 : null,
    });
  }
  return rows;
}

/** Estimación actual: último saldo real + lo movido después de esa anotación (o el teórico si no hay anotaciones). */
export function currentEstimateCents(initialCents: number, flows: Flow[], snapshots: Snapshot[]): number {
  const last = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!last) return initialCents + flows.reduce((a, f) => a + f.cents, 0);
  return last.balanceCents + flows.filter((f) => f.date > last.date).reduce((a, f) => a + f.cents, 0);
}
