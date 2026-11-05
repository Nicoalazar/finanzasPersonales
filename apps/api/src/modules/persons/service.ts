import { addMonths, fromCents, installmentMonths, occursIn, splitInstallments, toCents, type PersonLineDto, type PersonSummaryDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { currentMonth, num } from "../../lib.js";
import { loadRecurring, myCents } from "../recurring/service.js";
import { installmentArs, installmentShareCents, loadStatementRates } from "../cards/statement.js";

export interface Accrual { personId: string; month: string; cents: number; line: PersonLineDto }

/** Todo lo que cada persona debe por mes: su parte de las cuotas de tarjeta + cargos manuales en cuotas. */
export async function accruals(personId?: string): Promise<Accrual[]> {
  const [installments, charges, recurring, rates] = await Promise.all([
    prisma.cardInstallment.findMany({
      where: { purchase: { shares: { some: personId ? { personId } : {} } } },
      include: { purchase: { include: { shares: true, card: true } } },
    }),
    prisma.personCharge.findMany({ where: personId ? { personId } : {} }),
    loadRecurring({ shares: { some: personId ? { personId } : {} } }),
    loadStatementRates(),
  ]);

  const out: Accrual[] = [];
  for (const i of installments) {
    const ars = installmentArs(i, rates);
    const amountCents = ars.cents;
    for (const s of i.purchase.shares) {
      if (personId && s.personId !== personId) continue;
      const cents = installmentShareCents(amountCents, { mode: s.mode, value: num(s.value) });
      out.push({
        personId: s.personId, month: i.month, cents,
        line: { kind: "CARD", refId: i.purchaseId, description: i.purchase.description, source: i.purchase.card.name, number: i.number, count: i.purchase.installmentCount, amount: fromCents(cents), ...(ars.estimated && { estimated: true }) },
      });
    }
  }
  for (const c of charges) {
    const amounts = splitInstallments(num(c.totalAmount), c.installmentCount);
    const months = installmentMonths(c.firstMonth, c.installmentCount);
    amounts.forEach((cents, idx) =>
      out.push({
        personId: c.personId, month: months[idx]!, cents,
        line: { kind: "CHARGE", refId: c.id, description: c.description, source: "Cargo manual", number: idx + 1, count: c.installmentCount, amount: fromCents(cents) },
      }),
    );
  }
  // Recurrentes: la persona paga una parte de lo que me toca cada mes (hasta 12 meses a futuro).
  const horizon = addMonths(currentMonth(), 12);
  for (const r of recurring) {
    const last = r.endMonth && r.endMonth < horizon ? r.endMonth : horizon;
    for (let m = r.startMonth; m <= last; m = addMonths(m, 1)) {
      if (!occursIn(r, m)) continue;
      const mine = myCents(r, m);
      if (mine <= 0) continue;
      for (const s of r.shares) {
        if (personId && s.personId !== personId) continue;
        const cents = installmentShareCents(mine, { mode: s.mode, value: num(s.value) });
        out.push({
          personId: s.personId, month: m, cents,
          line: { kind: "RECURRING", refId: r.id, description: r.name, source: r.sharedGroup?.name ?? "Recurrente", number: 1, count: 1, amount: fromCents(cents) },
        });
      }
    }
  }
  return out;
}

/** Categoría de ingresos "Reintegros": se reutiliza la marcada o una existente con ese nombre; si no, se crea. */
export async function reimbursementCategoryId(): Promise<string> {
  const flagged = await prisma.category.findFirst({ where: { isReimbursement: true } });
  if (flagged) return flagged.id;
  const byName = await prisma.category.findUnique({ where: { name_type: { name: "Reintegros", type: "INCOME" } } });
  if (byName) return (await prisma.category.update({ where: { id: byName.id }, data: { isReimbursement: true } })).id;
  return (await prisma.category.create({ data: { name: "Reintegros", type: "INCOME", isReimbursement: true } })).id;
}

/** Saldo de cada persona al mes `asOf`: devengado hasta ese mes − pagos recibidos. */
export async function personsSummary(asOf: string): Promise<PersonSummaryDto[]> {
  const [persons, rows, payments] = await Promise.all([
    prisma.person.findMany({ orderBy: { name: "asc" } }),
    accruals(),
    prisma.personPayment.groupBy({ by: ["personId"], _sum: { amount: true } }),
  ]);
  return persons.map((p): PersonSummaryDto => {
    const mine = rows.filter((r) => r.personId === p.id);
    const accrued = mine.filter((r) => r.month <= asOf).reduce((a, r) => a + r.cents, 0);
    const upcoming = mine.filter((r) => r.month > asOf).reduce((a, r) => a + r.cents, 0);
    const paid = toCents(num(payments.find((x) => x.personId === p.id)?._sum.amount));
    return { personId: p.id, name: p.name, accrued: fromCents(accrued), paid: fromCents(paid), balance: fromCents(accrued - paid), upcoming: fromCents(upcoming) };
  });
}
