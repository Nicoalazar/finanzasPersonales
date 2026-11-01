import type { FastifyInstance } from "fastify";
import {
  currentEstimateCents, fromCents, investmentMovementInput, investmentRows, snapshotInput, theoreticalAt, toCents,
  type Flow, type InvestmentAccountDto, type InvestmentMovementDto, type InvestmentsDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { fromDbDate, num, parse, toDbDate } from "../../lib.js";

const r2 = (cents: number) => fromCents(cents);

export async function investmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  /** Depósitos = transferencias hacia la cuenta de inversión; retiros = transferencias desde ella. Solo las pagadas. */
  app.get("/api/investments", async () => {
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
  });

  async function investmentAccount(id: string) {
    const a = await prisma.account.findUnique({ where: { id } });
    return a?.kind === "INVESTMENT" ? a : null;
  }

  /** Anotar el saldo real a una fecha; si ya había uno ese día, se reemplaza. */
  app.post("/api/investments/snapshots", async (req, reply) => {
    const body = parse(snapshotInput, req.body, reply);
    if (!body) return;
    if (!(await investmentAccount(body.accountId))) return reply.code(400).send({ error: "La cuenta tiene que ser de tipo Inversión" });
    const s = await prisma.balanceSnapshot.upsert({
      where: { accountId_date: { accountId: body.accountId, date: toDbDate(body.date) } },
      create: { accountId: body.accountId, date: toDbDate(body.date), balance: body.balance },
      update: { balance: body.balance },
    });
    return reply.code(201).send({ id: s.id });
  });

  app.delete<{ Params: { id: string } }>("/api/investments/snapshots/:id", async (req, reply) => {
    await prisma.balanceSnapshot.deleteMany({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  /** Depósito o retiro: se guarda como transferencia para que los saldos de las cuentas sigan cuadrando. */
  app.post("/api/investments/movements", async (req, reply) => {
    const body = parse(investmentMovementInput, req.body, reply);
    if (!body) return;
    const inv = await investmentAccount(body.accountId);
    if (!inv) return reply.code(400).send({ error: "La cuenta tiene que ser de tipo Inversión" });
    if (body.otherAccountId === body.accountId) return reply.code(400).send({ error: "Elegí una cuenta distinta" });
    const other = await prisma.account.findUnique({ where: { id: body.otherAccountId } });
    if (!other) return reply.code(400).send({ error: "Cuenta inexistente" });

    const deposit = body.kind === "DEPOSIT";
    const t = await prisma.transaction.create({
      data: {
        date: toDbDate(body.date), period: body.date.slice(0, 7), amount: body.amount, type: "TRANSFER", status: "PAID",
        accountId: deposit ? other.id : inv.id, toAccountId: deposit ? inv.id : other.id,
        description: deposit ? `Depósito a ${inv.name}` : `Retiro de ${inv.name}`,
      },
    });
    return reply.code(201).send({ id: t.id });
  });
}
