import {
  addMonths, defaultDueDate, fromCents, inflateCents, installmentMonths, isSacMonth, monthsBetween, occursIn, semesterMonths, splitInstallments, toCents,
  type ProjectionCategoryDto, type ProjectionDto, type ProjectionMonthDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { fromDbDate, num } from "../../lib.js";
import { buildStatement } from "../cards/statement.js";
import { loadRecurring, splitOf } from "../recurring/service.js";
import { spendingParts } from "../spending/service.js";

/** Meses completos (antes de `from`) que se buscan hacia atrás para el promedio del gasto variable. */
const LOOKBACK = 12;
/** Cuántos de esos meses (los más recientes con gastos) forman el promedio. */
const BASE_MONTHS = 3;

const sum = (m: Map<unknown, number>) => [...m.values()].reduce((a, c) => a + c, 0);

export async function getInflationPct(): Promise<number> {
  const s = await prisma.projectionSettings.findUnique({ where: { id: "default" } });
  return s ? num(s.inflationPct) : 0;
}

/**
 * Proyección mes a mes desde `from` (incluido), en base a lo que es mío:
 *  · Ingresos: sueldo neto (el recibo real si ya está cargado; si no, el último neto de cada trabajo activo, sin ajuste)
 *    + aguinaldo en junio y diciembre (real, o la mitad del mayor neto del semestre en trabajos registrados).
 *  · Gastos: mi parte de los recurrentes, mi neto de los resúmenes de tarjeta que vencen en el mes (cuotas ya compradas),
 *    las cuotas de lo que le debo a otras personas y el gasto variable estimado por categoría.
 *  · Inflación: el % mensual se aplica desde `from` a los recurrentes (desde su último precio cargado si es posterior) y al variable.
 *  Los reintegros no se proyectan: los gastos ya son solo mi parte.
 */
export async function buildProjection(from: string, months: number): Promise<ProjectionDto> {
  const range = installmentMonths(from, months);
  const last = range[range.length - 1]!;
  const lookback = Array.from({ length: LOOKBACK }, (_, i) => addMonths(from, -(i + 1)));

  const [inflationPct, recurring, skips, cards, dueOverrides, debts, jobs, payslips, categories, estimates, history, current] = await Promise.all([
    getInflationPct(),
    loadRecurring(),
    prisma.recurringSkip.findMany({ where: { period: { in: range } } }),
    prisma.creditCard.findMany(),
    prisma.cardStatement.findMany({ where: { dueDate: { not: null } }, select: { cardId: true, month: true, dueDate: true } }),
    prisma.personCharge.findMany({ where: { direction: "I_OWE" } }),
    prisma.job.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    prisma.payslip.findMany({ where: { job: { archived: false } }, orderBy: { month: "desc" } }),
    prisma.category.findMany({ where: { type: "EXPENSE" } }),
    prisma.spendingEstimate.findMany(),
    Promise.all(lookback.map((m) => spendingParts(m))),
    spendingParts(from),
  ]);

  // ---- ingresos ----
  const slip = new Map(payslips.map((p) => [`${p.jobId}|${p.month}|${p.kind}`, toCents(num(p.net))]));
  const lastNet = new Map<string, number>();
  for (const p of payslips) if (p.kind === "MONTHLY" && p.month <= from && !lastNet.has(p.jobId)) lastNet.set(p.jobId, toCents(num(p.net)));
  const activeJobs = jobs.filter((j) => lastNet.has(j.id) || payslips.some((p) => p.jobId === j.id && range.includes(p.month)));
  const monthlyNet = (jobId: string, m: string) => slip.get(`${jobId}|${m}|MONTHLY`) ?? lastNet.get(jobId) ?? 0;

  // ---- tarjetas: neto propio de cada resumen, en el mes en que vence ----
  const dueOverride = new Map(dueOverrides.map((s) => [`${s.cardId}|${s.month}`, fromDbDate(s.dueDate!).slice(0, 7)]));
  const statementMonths = installmentMonths(addMonths(from, -2), months + 2);
  const cardsByMonth = new Map<string, number>();
  await Promise.all(cards.flatMap((card) => statementMonths.map(async (sm) => {
    const due = dueOverride.get(`${card.id}|${sm}`) ?? defaultDueDate(sm, card.closingDay, card.dueDay).slice(0, 7);
    if (due < from || due > last) return;
    const st = await buildStatement(card.id, sm);
    if (st && st.netOwn !== 0) cardsByMonth.set(due, (cardsByMonth.get(due) ?? 0) + toCents(st.netOwn));
  })));

  // ---- deudas propias en cuotas ----
  const debtsByMonth = new Map<string, number>();
  for (const c of debts) {
    const amounts = splitInstallments(num(c.totalAmount), c.installmentCount);
    installmentMonths(c.firstMonth, c.installmentCount).forEach((m, i) => debtsByMonth.set(m, (debtsByMonth.get(m) ?? 0) + amounts[i]!));
  }

  // ---- gasto variable: promedio de los últimos meses completos con gastos, o monto propio ----
  const withData = lookback.map((m, i) => ({ m, parts: history[i]! })).filter((h) => sum(h.parts.total) > 0).slice(0, BASE_MONTHS);
  const partial = withData.length === 0;
  const base = partial ? [{ m: from, parts: current }] : withData;
  const estimateOf = new Map(estimates.map((e) => [e.categoryId, toCents(num(e.amount))]));
  const avgOf = (id: string | null) => Math.round(base.reduce((a, h) => a + (h.parts.variable.get(id) ?? 0), 0) / base.length);
  const rows: ProjectionCategoryDto[] = [
    ...categories.map((c) => ({ id: c.id as string | null, name: c.name })),
    { id: null, name: "Sin categoría" },
  ].map(({ id, name }) => {
    const average = avgOf(id);
    const estimate = id ? (estimateOf.get(id) ?? null) : null;
    return { categoryId: id, name, average: fromCents(average), estimate: estimate == null ? null : fromCents(estimate), base: fromCents(estimate ?? average), current: fromCents(current.variable.get(id) ?? 0) };
  }).filter((r) => r.average > 0 || r.estimate != null || r.current > 0)
    .sort((a, b) => b.base - a.base || a.name.localeCompare(b.name));
  const variableBase = rows.reduce((a, r) => a + toCents(r.base), 0);

  // ---- mes a mes ----
  const skipped = new Set(skips.map((s) => `${s.recurringId}|${s.period}`));
  let cumulative = 0;
  const out: ProjectionMonthDto[] = range.map((m) => {
    const salary = activeJobs.reduce((a, j) => a + monthlyNet(j.id, m), 0);
    const sac = isSacMonth(m)
      ? activeJobs.reduce((a, j) => {
        const real = slip.get(`${j.id}|${m}|SAC`);
        if (real != null) return a + real;
        return j.informal ? a : a + Math.round(Math.max(0, ...semesterMonths(m).filter((s) => s <= m).map((s) => monthlyNet(j.id, s))) / 2);
      }, 0)
      : 0;
    const recurringCents = recurring.reduce((a, r) => {
      if (!occursIn(r, m) || skipped.has(`${r.id}|${m}`)) return a;
      const priceFrom = r.prices.filter((p) => p.fromMonth <= m).reduce((x, p) => (p.fromMonth > x ? p.fromMonth : x), r.startMonth);
      return a + inflateCents(splitOf(r, m).mineCents, inflationPct, monthsBetween(priceFrom > from ? priceFrom : from, m));
    }, 0);
    const cardsCents = cardsByMonth.get(m) ?? 0;
    const debtsCents = debtsByMonth.get(m) ?? 0;
    const variable = inflateCents(variableBase, inflationPct, monthsBetween(from, m));
    const income = salary + sac;
    const expense = recurringCents + cardsCents + debtsCents + variable;
    cumulative += income - expense;
    return {
      month: m, salary: fromCents(salary), sac: fromCents(sac), income: fromCents(income),
      recurring: fromCents(recurringCents), cards: fromCents(cardsCents), debts: fromCents(debtsCents), variable: fromCents(variable), expense: fromCents(expense),
      balance: fromCents(income - expense), cumulative: fromCents(cumulative),
    };
  });

  return {
    from, inflationPct, baseMonths: base.map((h) => h.m).sort(), partial,
    jobs: activeJobs.map((j) => ({ jobId: j.id, name: j.name, net: fromCents(lastNet.get(j.id) ?? 0), informal: j.informal })),
    months: out, categories: rows,
  };
}
