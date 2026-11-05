import { budgetStatus, fromCents, toCents, type BudgetRowDto, type BudgetsDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { num } from "../../lib.js";
import { installmentArs, installmentShareCents, loadStatementRates } from "../cards/statement.js";
import { sharedCategoryCents } from "../shared/service.js";

/**
 * Gasto propio del mes por categoría (centavos; la clave null es "sin categoría").
 * Suma los movimientos de gasto y mi parte neta de las cuotas de tarjeta del resumen de ese mes.
 * El pago del resumen no se cuenta: no es un gasto nuevo, ya está en las compras.
 * De los gastos compartidos cuenta solo mi parte; mis pagos y el saldo con la pareja son caja, no categoría.
 */
export async function categorySpending(month: string): Promise<Map<string | null, number>> {
  const [txs, installments, shared, rates] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"], where: { period: month, type: "EXPENSE", statementId: null, sharedExpenseId: null, sharedMonth: null }, _sum: { amount: true },
    }),
    prisma.cardInstallment.findMany({ where: { month, purchase: { sharedExpenseId: null } }, include: { purchase: { include: { shares: true } } } }),
    sharedCategoryCents(month),
    loadStatementRates({ month }),
  ]);
  const out = new Map<string | null, number>();
  const add = (k: string | null, cents: number) => out.set(k, (out.get(k) ?? 0) + cents);

  for (const t of txs) add(t.categoryId, toCents(num(t._sum.amount)));
  for (const i of installments) {
    const amount = installmentArs(i, rates).cents;
    const others = i.purchase.shares.reduce((a, s) => a + installmentShareCents(amount, { mode: s.mode, value: num(s.value) }), 0);
    add(i.purchase.categoryId, Math.max(0, amount - others));
  }
  for (const [k, cents] of shared) add(k, cents);
  return out;
}

export async function buildBudgets(month: string): Promise<BudgetsDto> {
  const [categories, budgets, spending] = await Promise.all([
    prisma.category.findMany({ where: { type: "EXPENSE" }, orderBy: { name: "asc" } }),
    prisma.budget.findMany({ where: { month } }),
    categorySpending(month),
  ]);
  const budgetOf = new Map(budgets.map((b) => [b.categoryId, toCents(num(b.amount))]));

  const row = (categoryId: string | null, name: string): BudgetRowDto => {
    const budget = categoryId ? (budgetOf.get(categoryId) ?? null) : null;
    const spent = spending.get(categoryId) ?? 0;
    const { pct, status } = budgetStatus(spent, budget);
    return { categoryId, name, budget: budget == null ? null : fromCents(budget), spent: fromCents(spent), remaining: budget == null ? null : fromCents(budget - spent), pct, status };
  };

  const rows = categories.map((c) => row(c.id, c.name));
  if ((spending.get(null) ?? 0) > 0) rows.push(row(null, "Sin categoría"));

  const budgeted = rows.filter((r) => r.budget != null);
  const budgetTotal = budgeted.reduce((a, r) => a + toCents(r.budget!), 0);
  const spentInBudgeted = budgeted.reduce((a, r) => a + toCents(r.spent), 0);
  const { pct, status } = budgetStatus(spentInBudgeted, budgetTotal);
  return {
    month, rows,
    totals: {
      budget: fromCents(budgetTotal), spentInBudgeted: fromCents(spentInBudgeted),
      spentTotal: fromCents([...spending.values()].reduce((a, b) => a + b, 0)), pct, status,
      warn: rows.filter((r) => r.status === "WARN").length, over: rows.filter((r) => r.status === "OVER").length,
    },
  };
}
