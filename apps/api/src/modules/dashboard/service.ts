import { addMonths, fromCents, installmentMonths, toCents, type DashboardDto, type DashboardSeriesPoint } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { num } from "../../lib.js";
import { accountBalances } from "../accounts/service.js";
import { buildBudgets, categorySpending } from "../budgets/service.js";
import { buildStatement } from "../cards/statement.js";
import { buildInvestments } from "../investments/service.js";
import { personsSummary } from "../persons/service.js";

const pct1 = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export async function buildDashboard(month: string, months: number): Promise<DashboardDto> {
  const range = installmentMonths(addMonths(month, -(months - 1)), months);
  const [txs, investments, balances, accounts, cards, spending, budgets, people, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { period: { in: range }, type: { in: ["INCOME", "EXPENSE"] } },
      select: { period: true, type: true, amount: true, statementId: true, recurringId: true, category: { select: { isReimbursement: true } } },
    }),
    buildInvestments(),
    accountBalances(),
    prisma.account.findMany({ where: { archived: false, kind: { not: "INVESTMENT" } } }),
    prisma.creditCard.findMany(),
    // Gráfico de categorías: tarjeta = resumen del mes anterior (lo que se paga este mes); el resto, del mes actual.
    categorySpending(month, addMonths(month, -1)),
    buildBudgets(month),
    personsSummary(month),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);

  // ---- serie mensual (base caja, igual que la pantalla Mes) ----
  const acc = new Map(range.map((m) => [m, { income: 0, cards: 0, recurring: 0, other: 0, reimbursements: 0 }]));
  for (const t of txs) {
    const a = acc.get(t.period)!;
    const cents = toCents(num(t.amount));
    if (t.type === "INCOME") {
      if (t.category?.isReimbursement) a.reimbursements += cents;
      else a.income += cents;
    } else if (t.statementId) a.cards += cents;
    else if (t.recurringId) a.recurring += cents;
    else a.other += cents;
  }
  const invested = new Map(investments.byMonth.map((b) => [b.month, toCents(b.net)]));
  let cumulative = 0;
  const series: DashboardSeriesPoint[] = range.map((m) => {
    const a = acc.get(m)!;
    const expense = a.cards + a.recurring + a.other;
    const netExpense = expense - a.reimbursements;
    const balance = a.income - netExpense;
    cumulative += balance;
    return {
      month: m, income: fromCents(a.income), cards: fromCents(a.cards), recurring: fromCents(a.recurring), other: fromCents(a.other),
      expense: fromCents(expense), reimbursements: fromCents(a.reimbursements), netExpense: fromCents(netExpense), balance: fromCents(balance),
      cumulativeBalance: fromCents(cumulative), invested: fromCents(invested.get(m) ?? 0),
    };
  });
  const cur = series[series.length - 1]!;

  // ---- tarjetas: neto propio del resumen del mes ----
  const statements = await Promise.all(cards.map((c) => buildStatement(c.id, month)));
  const cardNetCents = statements.reduce((a, s) => a + toCents(s?.netOwn ?? 0), 0);

  // ---- patrimonio: cuentas comunes + inversiones al valor estimado ----
  const accountCents = accounts.map((x) => ({ x, cents: toCents(num(x.initialBalance)) + toCents(balances.get(x.id) ?? 0) }));
  const cashCents = accountCents.reduce((a, r) => a + r.cents, 0);
  const investCents = toCents(investments.totals.currentEstimate);
  const accountRows = [
    ...accountCents.map(({ x, cents }) => ({ accountId: x.id, name: x.name, kind: x.kind, balance: fromCents(cents) })),
    ...investments.accounts.map((i) => ({ accountId: i.accountId, name: i.name, kind: "INVESTMENT" as const, balance: i.currentEstimate })),
  ];

  // ---- categorías (resto del mes + tarjeta del mes anterior, que se paga este mes): top 8 + Otras ----
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const sorted = [...spending].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const totalCats = sorted.reduce((a, [, c]) => a + c, 0);
  const row = ([id, c]: [string | null, number]) => ({ categoryId: id, name: id ? (nameOf.get(id) ?? "?") : "Sin categoría", amount: fromCents(c), pct: pct1(c, totalCats) ?? 0 });
  const allCategories = sorted.map(row);
  const top = sorted.slice(0, 8).map(row);
  const restCents = sorted.slice(8).reduce((a, [, c]) => a + c, 0);
  if (restCents > 0) top.push({ categoryId: null, name: "Otras", amount: fromCents(restCents), pct: pct1(restCents, totalCats) ?? 0 });

  const income = toCents(cur.income);
  return {
    month,
    kpis: {
      income: cur.income, expense: cur.expense, reimbursements: cur.reimbursements, netExpense: cur.netExpense, balance: cur.balance,
      expenseRatio: pct1(toCents(cur.netExpense), income), savingsRate: pct1(toCents(cur.balance), income),
      cardNet: fromCents(cardNetCents), cardRatio: pct1(cardNetCents, income),
    },
    netWorth: { cash: fromCents(cashCents), investments: fromCents(investCents), total: fromCents(cashCents + investCents), accounts: accountRows },
    series, categories: top, allCategories,
    budgets: { totals: budgets.totals, flagged: budgets.rows.filter((r) => r.status === "OVER" || r.status === "WARN").sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 5) },
    debtors: people.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance),
  };
}
