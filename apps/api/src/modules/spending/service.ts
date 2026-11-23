import { fromCents, toCents, type SpendingDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { num } from "../../lib.js";
import { installmentArs, installmentShareCents, loadStatementRates } from "../cards/statement.js";
import { sharedCategoryCents } from "../shared/service.js";
import { debtCategoryCents } from "../persons/service.js";
import { loadRecurring, splitOf } from "../recurring/service.js";

type ByCategory = Map<string | null, number>;

/**
 * Gasto propio del mes por categoría (centavos; la clave null es "sin categoría"), separado por origen:
 *  · recurring: mi parte de los recurrentes generados (de los de un grupo con persona se descuenta lo que esa persona me debe).
 *  · committed: cuotas 2.ª en adelante de compras con tarjeta (ya se conocen de antes: la proyección las toma de los resúmenes).
 *  · debts: lo que otra persona pagó por mí, en el mes de cada cuota.
 *  · variable: todo lo demás (movimientos sueltos, 1.ª cuota o pago único con tarjeta, mi parte de los compartidos).
 * El pago del resumen no se cuenta (ya está en las compras); los pagos y saldos con personas o la pareja son caja.
 * `cardMonth` permite tomar las cuotas de tarjeta de otro mes (por defecto, el mismo).
 */
export async function spendingParts(month: string, cardMonth: string = month) {
  const [txs, installments, shared, rates, debts] = await Promise.all([
    prisma.transaction.findMany({
      where: { period: month, type: "EXPENSE", statementId: null, sharedExpenseId: null, sharedMonth: null, personPaymentId: null },
      select: { categoryId: true, amount: true, recurringId: true },
    }),
    prisma.cardInstallment.findMany({ where: { month: cardMonth, purchase: { sharedExpenseId: null } }, include: { purchase: { include: { shares: true } } } }),
    sharedCategoryCents(month),
    loadStatementRates({ month: cardMonth }),
    debtCategoryCents(month),
  ]);
  const variable: ByCategory = new Map(), recurring: ByCategory = new Map(), committed: ByCategory = new Map();
  const add = (m: ByCategory, k: string | null, cents: number) => m.set(k, (m.get(k) ?? 0) + cents);

  const recurringPaid = new Map<string, number>();
  for (const t of txs) {
    const cents = toCents(num(t.amount));
    if (t.recurringId) {
      add(recurring, t.categoryId, cents);
      recurringPaid.set(t.recurringId, (recurringPaid.get(t.recurringId) ?? 0) + cents);
    } else add(variable, t.categoryId, cents);
  }
  // Recurrente de un grupo con persona: pago el total, pero lo que la persona me debe no es gasto mío.
  if (recurringPaid.size) {
    const owed = await loadRecurring({ id: { in: [...recurringPaid.keys()] }, sharedGroup: { personId: { not: null } } });
    for (const r of owed) add(recurring, r.categoryId, -Math.min(splitOf(r, month).owedCents, recurringPaid.get(r.id)!));
  }
  for (const i of installments) {
    const amount = installmentArs(i, rates).cents;
    const others = i.purchase.shares.reduce((a, s) => a + installmentShareCents(amount, { mode: s.mode, value: num(s.value) }), 0);
    add(i.number > 1 ? committed : variable, i.purchase.categoryId, Math.max(0, amount - others));
  }
  for (const [k, cents] of shared) add(variable, k, cents);

  const total: ByCategory = new Map();
  for (const m of [variable, recurring, committed, debts]) for (const [k, c] of m) add(total, k, c);
  return { total, variable, recurring, committed, debts };
}

/** Gasto propio total del mes por categoría (centavos). */
export async function categorySpending(month: string, cardMonth: string = month): Promise<ByCategory> {
  return (await spendingParts(month, cardMonth)).total;
}

/** Gasto del mes por categoría de gastos (todas, aunque estén en 0) + "Sin categoría" si hay. */
export async function buildSpending(month: string): Promise<SpendingDto> {
  const [categories, spending] = await Promise.all([
    prisma.category.findMany({ where: { type: "EXPENSE" }, orderBy: { name: "asc" } }),
    categorySpending(month),
  ]);
  const rows = categories.map((c) => ({ categoryId: c.id as string | null, name: c.name, spent: fromCents(spending.get(c.id) ?? 0) }));
  if ((spending.get(null) ?? 0) > 0) rows.push({ categoryId: null, name: "Sin categoría", spent: fromCents(spending.get(null)!) });
  return { month, rows, total: fromCents([...spending.values()].reduce((a, c) => a + c, 0)) };
}
