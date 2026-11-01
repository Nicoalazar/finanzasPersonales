import {
  computeStatement, defaultClosingDate, defaultDueDate, fromCents, shareCents, toCents,
  type StatementDto, type StatementItemDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { fromDbDate, num } from "../../lib.js";

/** Cierre efectivo de un resumen: el cargado a mano o el día por defecto de la tarjeta. */
export async function closingDateFor(card: { id: string; closingDay: number }, month: string): Promise<string> {
  const st = await prisma.cardStatement.findUnique({ where: { cardId_month: { cardId: card.id, month } }, select: { closingDate: true } });
  return st?.closingDate ? fromDbDate(st.closingDate) : defaultClosingDate(month, card.closingDay);
}

/** Arma el resumen de una tarjeta para un mes a partir de las cuotas que caen en ese mes. */
/** Parte de un tercero sobre una cuota, acotada al importe de la cuota. */
export const installmentShareCents = (amountCents: number, share: { mode: "PERCENT" | "AMOUNT"; value: number }) =>
  Math.min(shareCents(amountCents, share), amountCents);

export async function buildStatement(cardId: string, month: string): Promise<StatementDto | null> {
  const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
  if (!card) return null;
  const [rows, stored] = await Promise.all([
    prisma.cardInstallment.findMany({
      where: { month, purchase: { cardId } },
      include: { purchase: { include: { shares: { include: { person: true } } } } },
      orderBy: [{ purchase: { date: "asc" } }, { number: "asc" }],
    }),
    prisma.cardStatement.findUnique({ where: { cardId_month: { cardId, month } } }),
  ]);

  const byPerson = new Map<string, { personId: string; name: string; cents: number }>();
  const items: StatementItemDto[] = rows.map((r) => {
    const amountCents = toCents(num(r.amount));
    const shares = r.purchase.shares.map((s) => {
      const cents = installmentShareCents(amountCents, { mode: s.mode, value: num(s.value) });
      const acc = byPerson.get(s.personId) ?? { personId: s.personId, name: s.person.name, cents: 0 };
      acc.cents += cents;
      byPerson.set(s.personId, acc);
      return { personId: s.personId, name: s.person.name, amount: fromCents(cents) };
    });
    return {
      installmentId: r.id, purchaseId: r.purchaseId, description: r.purchase.description, number: r.number,
      count: r.purchase.installmentCount, amount: fromCents(amountCents),
      thirdParty: fromCents(shares.reduce((a, s) => a + toCents(s.amount), 0)), shares,
    };
  });

  const thirdPartyCents = [...byPerson.values()].reduce((a, p) => a + p.cents, 0);
  const adjustmentCents = toCents(num(stored?.adjustment));
  const refundsCents = toCents(num(stored?.refunds));
  const s = computeStatement({
    installmentsCents: items.map((i) => toCents(i.amount)),
    stampTaxRate: num(card.stampTaxRate), adjustmentCents, thirdPartyCents, refundsCents,
  });
  return {
    cardId, month, items,
    subtotal: fromCents(s.subtotalCents), stampTax: fromCents(s.stampTaxCents), adjustment: fromCents(adjustmentCents),
    total: fromCents(s.totalCents), thirdParty: fromCents(thirdPartyCents), refunds: fromCents(refundsCents), netOwn: fromCents(s.netOwnCents),
    byPerson: [...byPerson.values()].map((p) => ({ personId: p.personId, name: p.name, amount: fromCents(p.cents) })),
    paidAt: stored?.paidAt ? fromDbDate(stored.paidAt) : null,
    closingDate: stored?.closingDate ? fromDbDate(stored.closingDate) : defaultClosingDate(month, card.closingDay),
    dueDate: stored?.dueDate ? fromDbDate(stored.dueDate) : defaultDueDate(month, card.closingDay, card.dueDay),
    closingIsCustom: !!stored?.closingDate,
    dueIsCustom: !!stored?.dueDate,
  };
}
