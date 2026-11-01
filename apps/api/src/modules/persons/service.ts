import { fromCents, installmentMonths, splitInstallments, toCents, type PersonLineDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { num } from "../../lib.js";
import { installmentShareCents } from "../cards/statement.js";

export interface Accrual { personId: string; month: string; cents: number; line: PersonLineDto }

/** Todo lo que cada persona debe por mes: su parte de las cuotas de tarjeta + cargos manuales en cuotas. */
export async function accruals(personId?: string): Promise<Accrual[]> {
  const [installments, charges] = await Promise.all([
    prisma.cardInstallment.findMany({
      where: { purchase: { shares: { some: personId ? { personId } : {} } } },
      include: { purchase: { include: { shares: true, card: true } } },
    }),
    prisma.personCharge.findMany({ where: personId ? { personId } : {} }),
  ]);

  const out: Accrual[] = [];
  for (const i of installments) {
    const amountCents = toCents(num(i.amount));
    for (const s of i.purchase.shares) {
      if (personId && s.personId !== personId) continue;
      const cents = installmentShareCents(amountCents, { mode: s.mode, value: num(s.value) });
      out.push({
        personId: s.personId, month: i.month, cents,
        line: { kind: "CARD", refId: i.purchaseId, description: i.purchase.description, source: i.purchase.card.name, number: i.number, count: i.purchase.installmentCount, amount: fromCents(cents) },
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
