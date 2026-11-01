import { prisma } from "../../plugins/db.js";
import { num } from "../../lib.js";

/** Saldo = inicial + ingresos − gastos − transferencias salientes + entrantes (solo PAID). */
export async function accountBalances(): Promise<Map<string, number>> {
  const [byAccount, incoming] = await Promise.all([
    prisma.transaction.groupBy({ by: ["accountId", "type"], where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["toAccountId"], where: { status: "PAID", type: "TRANSFER" }, _sum: { amount: true } }),
  ]);
  const m = new Map<string, number>();
  const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  for (const r of byAccount) add(r.accountId, (r.type === "INCOME" ? 1 : -1) * num(r._sum.amount));
  for (const r of incoming) if (r.toAccountId) add(r.toAccountId, num(r._sum.amount));
  return m;
}
