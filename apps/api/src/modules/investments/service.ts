import {
  currentEstimateCents, fromCents, investmentRows, theoreticalAt, toCents,
  type Flow, type InvestmentAccountDto, type InvestmentMovementDto, type InvestmentsDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { fromDbDate, num } from "../../lib.js";

const r2 = (cents: number) => fromCents(cents);

/** Depósitos = transferencias hacia la cuenta de inversión; retiros = transferencias desde ella. Solo las pagadas. */
export async function buildInvestments(): Promise<InvestmentsDto> {
    const accounts = await prisma.account.findMany({ where: { kind: "INVESTMENT", archived: false }, orderBy: { name: "asc" } });
    const ids = accounts.map((a) => a.id);
    const [transfers, snapshots] = await Promise.all([
      prisma.transaction.findMany({
        where: { type: "TRANSFER", status: "PAID", OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.balanceSnapshot.findMany({ where: { accountId: { in: ids } } }),
    ]);

    const byMonth = new Map<string, { deposits: number; withdrawals: number }>();
    const bumpMonth = (month: string, kind: "deposits" | "withdrawals", cents: number) => {
      const m = byMonth.get(month) ?? { deposits: 0, withdrawals: 0 };
      m[kind] += cents;
      byMonth.set(month, m);
    };

    const out: InvestmentAccountDto[] = accounts.map((a) => {
      const movements: InvestmentMovementDto[] = [];
      const flows: Flow[] = [];
      for (const t of transfers) {
        const cents = toCents(num(t.amount));
        const date = fromDbDate(t.date);
        // una transferencia entre dos cuentas de inversión es retiro en una y depósito en la otra
        if (t.toAccountId === a.id) {
          flows.push({ date, cents });
          movements.push({ id: t.id, date, kind: "DEPOSIT", amount: r2(cents), otherAccountId: t.accountId, description: t.description });
        } else if (t.accountId === a.id) {
          flows.push({ date, cents: -cents });
          movements.push({ id: t.id, date, kind: "WITHDRAWAL", amount: r2(cents), otherAccountId: t.toAccountId!, description: t.description });
        }
      }
      for (const m of movements) bumpMonth(m.date.slice(0, 7), m.kind === "DEPOSIT" ? "deposits" : "withdrawals", toCents(m.amount));

      const initial = toCents(num(a.initialBalance));
      const snaps = snapshots.filter((s) => s.accountId === a.id).map((s) => ({ id: s.id, date: fromDbDate(s.date), balanceCents: toCents(num(s.balance)) }));
      const rows = investmentRows(initial, flows, snaps);
      const last = rows.at(-1);
      const deposits = flows.filter((f) => f.cents > 0).reduce((x, f) => x + f.cents, 0);
      const withdrawals = -flows.filter((f) => f.cents < 0).reduce((x, f) => x + f.cents, 0);
      return {
        accountId: a.id, name: a.name, initialBalance: r2(initial),
        deposits: r2(deposits), withdrawals: r2(withdrawals), theoretical: r2(theoreticalAt(initial, flows, "9999-12-31")),
        lastSnapshot: last ? { id: last.id, date: last.date, real: r2(last.realCents) } : null,
        gain: last ? r2(last.gainCents) : null,
        gainPct: last && last.theoreticalCents > 0 ? Math.round((last.gainCents / last.theoreticalCents) * 10000) / 100 : null,
        currentEstimate: r2(currentEstimateCents(initial, flows, snaps)),
        snapshots: rows.reverse().map((x) => ({
          id: x.id, date: x.date, theoretical: r2(x.theoreticalCents), real: r2(x.realCents), gain: r2(x.gainCents),
          periodGain: r2(x.periodGainCents), returnPct: x.returnPct,
        })),
        movements,
      };
    });

    const body: InvestmentsDto = {
      accounts: out,
      totals: {
        theoretical: r2(out.reduce((x, a) => x + toCents(a.theoretical), 0)),
        currentEstimate: r2(out.reduce((x, a) => x + toCents(a.currentEstimate), 0)),
        gain: r2(out.reduce((x, a) => x + toCents(a.gain ?? 0), 0)),
      },
      byMonth: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
        month, deposits: r2(v.deposits), withdrawals: r2(v.withdrawals), net: r2(v.deposits - v.withdrawals),
      })),
    };
    return body;
}
