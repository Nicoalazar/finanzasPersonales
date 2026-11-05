import { useState } from "react";
import { Link } from "react-router-dom";
import { TransactionForm } from "../components/TransactionForm";
import { MonthNav } from "../components/MonthNav";
import { StatRow, iconBtn, iconBtnDanger } from "../components/Stats";
import { currentMonth, formatDay, formatMoney } from "../lib/format";
import { useAccounts, useBudgets, useCategories, useDeleteTransaction, useGenerateMonth, useTransactions, useUpdateTransaction } from "../lib/queries";

export function Month() {
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState(false);
  const gen = useGenerateMonth(month);
  const { data, isLoading } = useTransactions(month, !gen.isLoading);
  const accounts = useAccounts().data ?? [];
  const categories = useCategories().data ?? [];
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Sin categoría";
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "?";
  const s = data?.summary;
  const alerts = useBudgets(month).data?.totals;

  return (
    <main className="space-y-4">
      <MonthNav month={month} onChange={setMonth}>
        <a className="rounded bg-white px-3 py-1.5 shadow" href={`/api/export/transactions.csv?from=${month}`} download>Exportar CSV</a>
        {!adding && <button className="rounded bg-slate-900 px-3 py-1.5 text-white" onClick={() => setAdding(true)}>+ Movimiento</button>}
      </MonthNav>

      <StatRow items={[
        { label: "Ingresos", value: formatMoney(s?.income ?? 0), cls: "text-emerald-600" },
        {
          label: "Gasto neto", value: formatMoney(s?.netExpense ?? 0), cls: "text-rose-600",
          sub: (s?.reimbursements ?? 0) > 0 ? `${formatMoney(s!.expense)} − reintegros ${formatMoney(s!.reimbursements)}` : undefined,
        },
        { label: "Resultado", value: formatMoney(s?.balance ?? 0), cls: (s?.balance ?? 0) < 0 ? "text-rose-600" : "text-slate-900" },
      ]} />

      {alerts && (alerts.over > 0 || alerts.warn > 0) && (
        <Link to="/presupuestos" className="block rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow">
          Presupuesto: {alerts.over > 0 && <b className="text-rose-700">{alerts.over} superada{alerts.over > 1 ? "s" : ""}</b>}
          {alerts.over > 0 && alerts.warn > 0 && " · "}{alerts.warn > 0 && <b>{alerts.warn} cerca del límite</b>} →
        </Link>
      )}

      {adding && <TransactionForm onDone={() => setAdding(false)} />}

      <section className="divide-y rounded-xl bg-white shadow">
        {isLoading && <p className="p-4 text-sm text-slate-500">Cargando…</p>}
        {data?.items.length === 0 && <p className="p-4 text-sm text-slate-500">No hay movimientos este mes.</p>}
        {data?.items.map((t) => (
          <div key={t.id} className="flex items-start gap-3 py-2 pl-4 pr-2">
            <span className="w-10 shrink-0 pt-0.5 text-xs text-slate-500">{formatDay(t.date)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 pr-2">
                <span className="truncate text-sm">{t.description || (t.type === "TRANSFER" ? `${accName(t.accountId)} → ${accName(t.toAccountId!)}` : catName(t.categoryId))}</span>
                <span className={`shrink-0 text-sm font-medium tabular-nums ${t.type === "INCOME" ? "text-emerald-600" : t.type === "EXPENSE" ? "text-rose-600" : "text-slate-500"}`}>
                  {t.type === "EXPENSE" ? "−" : ""}{formatMoney(t.amount)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="min-w-0 truncate">
                  {t.recurringId && <span title="Recurrente" className="mr-1 text-slate-400">↻</span>}
                  {t.type === "TRANSFER" ? "Transferencia" : catName(t.categoryId)} · {accName(t.accountId)}
                </span>
                <span className="ml-auto flex shrink-0 items-center">
                  {t.status === "PENDING" && (
                    <button className="mr-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title="Marcar como pagado" onClick={() => update.mutate({ id: t.id, patch: { status: "PAID" } })}>Pendiente</button>
                  )}
                  {t.status === "PENDING" && (
                    <button className={iconBtn} aria-label="Editar monto" title="Editar monto (queda fijo)"
                      onClick={() => { const v = prompt("Nuevo monto", String(t.amount)); const n = Number((v ?? "").replace(",", ".")); if (v !== null && n > 0) update.mutate({ id: t.id, patch: { amount: n } }); }}>✎</button>
                  )}
                  {t.sharedExpenseId ? (
                    <Link to="/compartidos" className={iconBtn} title="Pago de un gasto compartido: se edita desde Compartidos">⇄</Link>
                  ) : (
                    <button className={iconBtnDanger} aria-label="Eliminar" onClick={() => confirm("¿Eliminar este movimiento?") && remove.mutate(t.id)}>✕</button>
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
