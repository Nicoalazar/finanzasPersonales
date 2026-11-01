import { useState } from "react";
import { TransactionForm } from "../components/TransactionForm";
import { currentMonth, formatDay, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import { useAccounts, useCategories, useDeleteTransaction, useTransactions, useUpdateTransaction } from "../lib/queries";

export function Month() {
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useTransactions(month);
  const accounts = useAccounts().data ?? [];
  const categories = useCategories().data ?? [];
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Sin categoría";
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "?";
  const s = data?.summary;

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="rounded bg-white px-2 py-1 shadow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">‹</button>
          <h1 className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</h1>
          <button className="rounded bg-white px-2 py-1 shadow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">›</button>
        </div>
        {!adding && <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={() => setAdding(true)}>+ Movimiento</button>}
      </div>

      <section className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white p-3 shadow">
          <div className="text-xs text-slate-500">Ingresos</div>
          <div className="font-semibold text-emerald-600">{formatMoney(s?.income ?? 0)}</div>
        </div>
        <div className="rounded-xl bg-white p-3 shadow">
          <div className="text-xs text-slate-500">Gasto neto</div>
          <div className="font-semibold text-rose-600">{formatMoney(s?.netExpense ?? 0)}</div>
          {(s?.reimbursements ?? 0) > 0 && <div className="text-[11px] text-slate-500">{formatMoney(s!.expense)} − reintegros {formatMoney(s!.reimbursements)}</div>}
        </div>
        <div className="rounded-xl bg-white p-3 shadow">
          <div className="text-xs text-slate-500">Resultado</div>
          <div className={`font-semibold ${(s?.balance ?? 0) < 0 ? "text-rose-600" : "text-slate-900"}`}>{formatMoney(s?.balance ?? 0)}</div>
        </div>
      </section>

      {adding && <TransactionForm onDone={() => setAdding(false)} />}

      <section className="divide-y rounded-xl bg-white shadow">
        {isLoading && <p className="p-4 text-sm text-slate-500">Cargando…</p>}
        {data?.items.length === 0 && <p className="p-4 text-sm text-slate-500">No hay movimientos este mes.</p>}
        {data?.items.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-11 text-xs text-slate-500">{formatDay(t.date)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{t.description || (t.type === "TRANSFER" ? `${accName(t.accountId)} → ${accName(t.toAccountId!)}` : catName(t.categoryId))}</div>
              <div className="text-xs text-slate-500">{t.type === "TRANSFER" ? "Transferencia" : catName(t.categoryId)} · {accName(t.accountId)}</div>
            </div>
            {t.status === "PENDING" && (
              <button className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title="Marcar como pagado" onClick={() => update.mutate({ id: t.id, patch: { status: "PAID" } })}>Pendiente</button>
            )}
            <span className={`text-sm font-medium ${t.type === "INCOME" ? "text-emerald-600" : t.type === "EXPENSE" ? "text-rose-600" : "text-slate-500"}`}>
              {t.type === "EXPENSE" ? "−" : ""}{formatMoney(t.amount)}
            </span>
            <button className="text-slate-400 hover:text-rose-600" aria-label="Eliminar" onClick={() => confirm("¿Eliminar este movimiento?") && remove.mutate(t.id)}>✕</button>
          </div>
        ))}
      </section>
    </main>
  );
}
