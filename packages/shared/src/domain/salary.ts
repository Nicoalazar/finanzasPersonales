/** Meses (YYYY-MM) del semestre al que pertenece un mes: enero–junio o julio–diciembre. */
export function semesterMonths(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const start = m <= 6 ? 1 : 7;
  return Array.from({ length: 6 }, (_, i) => `${y}-${String(start + i).padStart(2, "0")}`);
}

/** SAC sugerido (bruto) = mitad del mayor bruto mensual del semestre. null si no hay recibos. */
export function sacSuggestionCents(semesterGrossCents: number[]): number | null {
  return semesterGrossCents.length === 0 ? null : Math.round(Math.max(...semesterGrossCents) / 2);
}
