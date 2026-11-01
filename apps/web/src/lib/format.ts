const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
export const formatMoney = (n: number) => money.format(n);

export const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);
export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const formatDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
/** Para ejes y etiquetas: 0 / 500 mil / 1,5 M */
export const formatCompact = (n: number) => compact.format(n);

/** "ene", y "ene 26" cuando hace falta ubicar el año. */
export function monthShort(ym: string, withYear = false): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return withYear ? `${s} ${String(y).slice(2)}` : s;
}

/** Máximo "redondo" para el eje, con escalones finos para no desperdiciar espacio. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v) ?? 10) * p;
}
