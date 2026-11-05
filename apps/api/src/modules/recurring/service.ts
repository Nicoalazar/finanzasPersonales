import type { Prisma } from "@prisma/client";
import { dateInMonth, occursIn, percentAt, priceAt, recurringCents, toCents } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { num, toDbDate } from "../../lib.js";

const include = { prices: true, shares: true, sharedGroup: { include: { overrides: true } } } satisfies Prisma.RecurringExpenseInclude;
export type LoadedRecurring = Prisma.RecurringExpenseGetPayload<{ include: typeof include }>;

export const loadRecurring = (where?: Prisma.RecurringExpenseWhereInput) =>
  prisma.recurringExpense.findMany({ where, include, orderBy: { name: "asc" } });

export const priceOf = (r: LoadedRecurring, month: string) =>
  priceAt(r.prices.map((p) => ({ fromMonth: p.fromMonth, amount: num(p.amount) })), month);

export const groupPercentOf = (r: LoadedRecurring, month: string): number | null =>
  r.sharedGroup
    ? percentAt(num(r.sharedGroup.myPercent), r.sharedGroup.overrides.map((o) => ({ month: o.month, percent: num(o.percent) })), month)
    : null;

/**
 * Cómo se reparte un recurrente en el mes (centavos).
 *  · Grupo con persona asignada: pago yo el total y la persona me debe lo que no es mi %.
 *  · Grupo sin persona: cada uno paga lo suyo, de mi cuenta sale solo mi %.
 *  · Sin grupo: es todo mío.
 */
export function splitOf(r: LoadedRecurring, month: string) {
  const totalCents = toCents(priceOf(r, month));
  const mineCents = recurringCents(totalCents, groupPercentOf(r, month));
  const shared = !!r.sharedGroup?.personId;
  return { totalCents, mineCents, paidCents: shared ? totalCents : mineCents, owedCents: shared ? totalCents - mineCents : 0 };
}

/** Lo que sale de mi cuenta en el mes (centavos). */
export const paidCents = (r: LoadedRecurring, month: string): number => splitOf(r, month).paidCents;

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/**
 * Crea los pendientes del mes que faltan y refresca los que siguen pendientes y sin editar a mano.
 * Es idempotente: se puede llamar cada vez que se abre el mes.
 */
export async function generateMonth(month: string): Promise<{ created: number; updated: number }> {
  const recs = (await loadRecurring()).filter((r) => r.accountId && occursIn(r, month));
  if (recs.length === 0) return { created: 0, updated: 0 };
  const ids = recs.map((r) => r.id);
  const [existing, skips] = await Promise.all([
    prisma.transaction.findMany({ where: { period: month, recurringId: { in: ids } } }),
    prisma.recurringSkip.findMany({ where: { period: month, recurringId: { in: ids } } }),
  ]);
  const skipped = new Set(skips.map((s) => s.recurringId));
  let created = 0, updated = 0;

  for (const r of recs) {
    if (skipped.has(r.id)) continue;
    const cents = paidCents(r, month);
    if (cents <= 0) continue;
    const amount = cents / 100;
    const data = {
      date: toDbDate(dateInMonth(month, r.dayOfMonth)), amount, description: r.name, categoryId: r.categoryId, accountId: r.accountId!,
    };
    const tx = existing.find((t) => t.recurringId === r.id);
    if (!tx) {
      try {
        await prisma.transaction.create({ data: { ...data, type: "EXPENSE", status: "PENDING", period: month, recurringId: r.id } });
        created++;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e; // otra llamada lo creó primero
      }
    } else if (tx.status === "PENDING" && !tx.amountLocked && (num(tx.amount) !== amount || tx.accountId !== data.accountId || tx.categoryId !== data.categoryId || tx.description !== data.description)) {
      await prisma.transaction.update({ where: { id: tx.id }, data });
      updated++;
    }
  }
  return { created, updated };
}
