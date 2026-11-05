import type { SharedExpense } from "@prisma/client";
import {
  fromCents, installmentMonths, occursIn, percentAt, sharedMonthCents, splitInstallments, toCents,
  type FormRow, type SharedEntryDto, type SharedImportResultDto, type SharedMonthDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { currentMonth, fromDbDate, num, toDbDate } from "../../lib.js";
import { installmentShareCents, resolveFirstMonth } from "../cards/statement.js";
import { loadRecurring, myCents, priceOf } from "../recurring/service.js";

/** Configuración única; la primera vez arranca en el mes actual y con el primer grupo compartido (Hogar). */
export async function getLedger() {
  const ledger = await prisma.sharedLedger.findUnique({ where: { id: "default" } });
  if (ledger && (ledger.groupId || !(await prisma.sharedGroup.count()))) return ledger;
  const group = await prisma.sharedGroup.findFirst({ orderBy: { name: "asc" } });
  return prisma.sharedLedger.upsert({
    where: { id: "default" },
    create: { id: "default", fromMonth: currentMonth(), groupId: group?.id ?? null },
    update: { groupId: group?.id ?? null },
  });
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Categoría de un tipo del formulario: la elegida, una de gastos con el mismo nombre o una nueva. */
export async function categoryForKind(kind: string): Promise<string | null> {
  const known = await prisma.sharedKind.findUnique({ where: { kind } });
  if (known) return known.categoryId;
  const expenses = await prisma.category.findMany({ where: { type: "EXPENSE" }, select: { id: true, name: true } });
  const categoryId = expenses.find((c) => norm(c.name) === norm(kind))?.id
    ?? (await prisma.category.create({ data: { name: kind, type: "EXPENSE" } })).id;
  await prisma.sharedKind.upsert({ where: { kind }, create: { kind, categoryId }, update: {} });
  return categoryId;
}

/**
 * Rehace lo que generó un pago mío: el movimiento desde la cuenta o la compra con tarjeta.
 * Lo que pagó la pareja, o un gasto ignorado, no mueve plata mía hasta el saldo del mes.
 */
export async function syncPayment(entry: SharedExpense, defaultAccountId: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { sharedExpenseId: entry.id } }),
    prisma.cardPurchase.deleteMany({ where: { sharedExpenseId: entry.id } }),
  ]);
  // todo tipo nuevo queda con categoría, lo haya pagado quien sea
  const categoryId = await categoryForKind(entry.kind);
  if (entry.payer !== "ME" || entry.ignored) return;
  const description = entry.description ? `${entry.kind}: ${entry.description}` : entry.kind;
  const date = fromDbDate(entry.date);
  const card = entry.cardId ? await prisma.creditCard.findUnique({ where: { id: entry.cardId } }) : null;
  if (card) {
    const first = await resolveFirstMonth(card, date);
    const amounts = splitInstallments(num(entry.amount), entry.installmentCount);
    const months = installmentMonths(first, entry.installmentCount);
    await prisma.cardPurchase.create({
      data: {
        cardId: card.id, date: entry.date, description, categoryId, totalAmount: entry.amount, installmentCount: entry.installmentCount,
        firstStatementMonth: first, sharedExpenseId: entry.id,
        installments: { create: amounts.map((c, i) => ({ number: i + 1, month: months[i]!, amount: fromCents(c) })) },
      },
    });
    return;
  }
  const accountId = entry.accountId ?? defaultAccountId;
  if (!accountId) return;
  await prisma.transaction.create({
    data: { date: entry.date, period: entry.month, amount: entry.amount, type: "EXPENSE", status: "PAID", description, categoryId, accountId, sharedExpenseId: entry.id },
  });
}

/**
 * Concilia las respuestas del formulario con lo importado: crea las nuevas, borra las que ya no están
 * (o quedaron antes de `fromMonth`) y deja intactas las existentes con sus cambios (cuenta, tarjeta).
 */
export async function importRows(rows: FormRow[], errors: SharedImportResultDto["errors"]): Promise<SharedImportResultDto> {
  const ledger = await getLedger();
  const wanted = rows.filter((r) => r.date.slice(0, 7) >= ledger.fromMonth);
  const wantedKeys = new Set(wanted.map((r) => r.key));
  const existing = await prisma.sharedExpense.findMany({ where: { source: "FORM" }, select: { id: true, externalKey: true } });
  const have = new Set(existing.map((e) => e.externalKey));

  const stale = existing.filter((e) => !e.externalKey || !wantedKeys.has(e.externalKey)).map((e) => e.id);
  if (stale.length) await prisma.sharedExpense.deleteMany({ where: { id: { in: stale } } });

  let created = 0, unchanged = 0;
  const seen = new Set<string>();
  for (const r of wanted) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    if (have.has(r.key)) { unchanged++; continue; }
    const entry = await prisma.sharedExpense.create({
      data: { date: toDbDate(r.date), month: r.date.slice(0, 7), payer: r.payer, kind: r.kind, description: r.description, amount: r.amount, source: "FORM", externalKey: r.key },
    });
    await syncPayment(entry, ledger.defaultAccountId);
    created++;
  }
  await prisma.sharedLedger.update({ where: { id: "default" }, data: { lastSyncAt: new Date() } });
  return { created, removed: stale.length, unchanged, skippedBefore: rows.length - wanted.length, errors };
}

export const entryDto = (e: SharedExpense): SharedEntryDto => ({
  id: e.id, date: fromDbDate(e.date), payer: e.payer, kind: e.kind, description: e.description, amount: num(e.amount), source: e.source,
  accountId: e.accountId, cardId: e.cardId, installmentCount: e.installmentCount,
});

async function monthPercent(groupId: string | null, month: string) {
  const group = groupId ? await prisma.sharedGroup.findUnique({ where: { id: groupId }, include: { overrides: true } }) : null;
  if (!group) return { percent: 50, percentIsOwn: false };
  const overrides = group.overrides.map((o) => ({ month: o.month, percent: num(o.percent) }));
  return { percent: percentAt(num(group.myPercent), overrides, month), percentIsOwn: overrides.some((o) => o.month === month) };
}

/** Mi parte del mes por categoría (centavos), para presupuestos y el resumen por categoría. */
export async function sharedCategoryCents(month: string): Promise<Map<string | null, number>> {
  const ledger = await getLedger();
  const [entries, kinds, { percent }] = await Promise.all([
    prisma.sharedExpense.findMany({ where: { month, ignored: false } }),
    prisma.sharedKind.findMany(),
    monthPercent(ledger.groupId, month),
  ]);
  const categoryOf = new Map(kinds.map((k) => [k.kind, k.categoryId]));
  const m = sharedMonthCents(entries.map((e) => ({ payer: e.payer, kind: e.kind, cents: toCents(num(e.amount)) })), percent);
  const out = new Map<string | null, number>();
  for (const [kind, k] of m.byKind) {
    const id = categoryOf.get(kind) ?? null;
    out.set(id, (out.get(id) ?? 0) + k.myCents);
  }
  return out;
}

export async function buildSharedMonth(month: string): Promise<SharedMonthDto> {
  const ledger = await getLedger();
  // la pareja de Compartidos es la persona con su mismo nombre (así se le asignan partes en Recurrentes)
  const partner = (await prisma.person.findMany()).find((p) => norm(p.name) === norm(ledger.partnerName));
  const [entries, kinds, settlements, { percent, percentIsOwn }, linkedRecurring] = await Promise.all([
    prisma.sharedExpense.findMany({ where: { month, ignored: false }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.sharedKind.findMany(),
    prisma.transaction.findMany({ where: { sharedMonth: month }, orderBy: { date: "asc" } }),
    monthPercent(ledger.groupId, month),
    loadRecurring({ OR: [...(ledger.groupId ? [{ sharedGroupId: ledger.groupId }] : []), ...(partner ? [{ shares: { some: { personId: partner.id } } }] : [])] }),
  ]);
  const categoryOf = new Map(kinds.map((k) => [k.kind, k.categoryId]));
  const m = sharedMonthCents(entries.map((e) => ({ payer: e.payer, kind: e.kind, cents: toCents(num(e.amount)) })), percent);

  // Recurrentes que entran al mes (los que borré del mes, salteados, no cuentan):
  //  · del grupo: cada parte paga lo suyo (la mía sale de mis movimientos), suman al total y a las partes pero no al saldo;
  //  · con una parte de mi pareja (sin grupo): pago yo el total y ella me devuelve su parte, que suma al saldo.
  const active = linkedRecurring.filter((r) => occursIn(r, month));
  const skipped = active.length
    ? new Set((await prisma.recurringSkip.findMany({ where: { period: month, recurringId: { in: active.map((r) => r.id) } } })).map((s) => s.recurringId))
    : new Set<string>();
  const recurring = active.filter((r) => !skipped.has(r.id)).flatMap((r) => {
    if (r.sharedGroupId && r.sharedGroupId === ledger.groupId) {
      const total = toCents(priceOf(r, month)), mine = myCents(r, month);
      return [{ r, totalCents: total, myCents: mine, partnerCents: total - mine, partnerOwesCents: 0, paidByMeCents: mine }];
    }
    const share = partner && r.shares.find((x) => x.personId === partner.id);
    if (!share) return [];
    const total = myCents(r, month);
    const owes = installmentShareCents(total, { mode: share.mode, value: num(share.value) });
    return [{ r, totalCents: total, myCents: total - owes, partnerCents: owes, partnerOwesCents: owes, paidByMeCents: total }];
  }).filter((x) => x.totalCents > 0);
  let balanceCents = m.balanceCents;
  for (const x of recurring) {
    const k = m.byKind.get(x.r.name) ?? { totalCents: 0, myCents: 0 };
    k.totalCents += x.totalCents;
    k.myCents += x.myCents;
    m.byKind.set(x.r.name, k);
    if (!categoryOf.has(x.r.name)) categoryOf.set(x.r.name, x.r.categoryId);
    m.totalCents += x.totalCents;
    m.myShareCents += x.myCents;
    m.paidByMe += x.paidByMeCents;
    m.paidByPartner += x.partnerCents - x.partnerOwesCents;
    balanceCents += x.partnerOwesCents;
  }
  const settledCents = settlements.reduce((a, t) => a + (t.type === "INCOME" ? 1 : -1) * toCents(num(t.amount)), 0);
  const pct = (c: number) => (m.totalCents > 0 ? Math.round((c / m.totalCents) * 1000) / 10 : 0);
  return {
    month, groupId: ledger.groupId, percent, percentIsOwn,
    total: fromCents(m.totalCents), myShare: fromCents(m.myShareCents), partnerShare: fromCents(m.totalCents - m.myShareCents),
    paidByMe: fromCents(m.paidByMe), paidByPartner: fromCents(m.paidByPartner),
    balance: fromCents(balanceCents), settled: fromCents(settledCents), pending: fromCents(balanceCents - settledCents),
    byKind: [...m.byKind].sort((a, b) => b[1].totalCents - a[1].totalCents).map(([kind, k]) => ({
      kind, categoryId: categoryOf.get(kind) ?? null, total: fromCents(k.totalCents), pct: pct(k.totalCents), myShare: fromCents(k.myCents),
    })),
    entries: entries.map(entryDto),
    settlements: settlements.map((t) => ({ transactionId: t.id, date: fromDbDate(t.date), amount: (t.type === "INCOME" ? 1 : -1) * num(t.amount), accountId: t.accountId })),
    recurring: recurring.map((x) => ({ id: x.r.id, name: x.r.name, total: fromCents(x.totalCents), myShare: fromCents(x.myCents) })),
    overlappingRecurring: recurring.filter((x) => x.r.sharedGroupId === ledger.groupId).map((x) => x.r.name),
  };
}
