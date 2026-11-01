import { useState } from "react";
import { Link } from "react-router-dom";
import { CumulativeChart, SeriesTable, StackedChart } from "../components/charts";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import { useDashboard } from "../lib/queries";

const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const card = "rounded-xl bg-white p-4 shadow";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${card} !p-3`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [months, setMonths] = useState(12);
  const [table, setTable] = useState(false);
  const { data: d, isLoading } = useDashboard(month, months);
  const from = shiftMonth(month, -(months - 1));

  const maxCat = Math.max(...(d?.categories.map((c) => c.amount) ?? [1]));
  const k = d?.kpis;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button className="rounded bg-white px-2 py-1 shadow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">‹</button>
          <h1 className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</h1>
          <button className="rounded bg-white px-2 py-1 shadow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">›</button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select className="rounded border bg-white px-2 py-1.5" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Meses a mostrar">
            {[6, 12, 24].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
          </select>
          <a className="rounded bg-white px-3 py-1.5 shadow" href={`/api/export/transactions.csv?from=${from}&to=${month}`} download>Exportar CSV</a>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {d && k && (
        <>
          <section className={card}>
            <div className="text-sm text-slate-500">Resultado de {monthLabel(month)}</div>
            <div className={`text-5xl font-semibold ${k.balance < 0 ? "text-rose-600" : ""}`}>{formatMoney(k.balance)}</div>
            <div className="mt-1 text-sm text-slate-500">
              Ingresos {formatMoney(k.income)} − gasto neto {formatMoney(k.netExpense)}
              {k.reimbursements > 0 && ` (gastos ${formatMoney(k.expense)} − reintegros ${formatMoney(k.reimbursements)})`}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Gasto / ingresos" value={k.expenseRatio == null ? "—" : `${pct.format(k.expenseRatio)}%`} sub="del gasto neto" />
            <Tile label="Ahorro del mes" value={k.savingsRate == null ? "—" : `${pct.format(k.savingsRate)}%`} sub="resultado / ingresos" />
            <Tile label="Tarjetas / ingresos" value={k.cardRatio == null ? "—" : `${pct.format(k.cardRatio)}%`} sub={`neto propio ${formatMoney(k.cardNet)}`} />
            <Tile label="Patrimonio" value={formatMoney(d.netWorth.total)} sub={`cuentas ${formatMoney(d.netWorth.cash)} · inversiones ${formatMoney(d.netWorth.investments)}`} />
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Gastos e ingresos por mes</h2>
              <button className="text-xs text-slate-500 underline" onClick={() => setTable(!table)}>{table ? "Ver gráficos" : "Ver como tabla"}</button>
            </div>
            {table ? <SeriesTable series={d.series} /> : <StackedChart series={d.series} />}
          </section>

          {!table && (
            <section className={`${card} space-y-2`}>
              <h2 className="font-semibold">Resultado acumulado</h2>
              <CumulativeChart series={d.series} />
            </section>
          )}

          <section className={`${card} space-y-2`}>
            <h2 className="font-semibold">Gasto por categoría <span className="text-xs font-normal text-slate-500">· incluye lo que va por tarjeta</span></h2>
            {d.categories.length === 0 && <p className="text-sm text-slate-500">Sin gastos este mes.</p>}
            {d.categories.map((c) => (
              <div key={c.name} className="grid grid-cols-[minmax(6rem,10rem)_1fr_11.5rem] items-center gap-3 text-sm">
                <span className="truncate">{c.name}</span>
                <div className="h-2.5 overflow-hidden rounded-r bg-slate-100"><div className="h-full rounded-r" style={{ width: `${(c.amount / maxCat) * 100}%`, background: "var(--series-1)" }} /></div>
                <span className="text-right tabular-nums">{formatMoney(c.amount)} <span className="text-xs text-slate-500">{pct.format(c.pct)}%</span></span>
              </div>
            ))}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className={`${card} space-y-2`}>
              <div className="flex items-baseline justify-between"><h2 className="font-semibold">Presupuestos</h2><Link to="/presupuestos" className="text-xs text-slate-500 underline">Ver todos</Link></div>
              {d.budgets.totals.budget === 0 && <p className="text-sm text-slate-500">No cargaste presupuestos para este mes.</p>}
              {d.budgets.totals.budget > 0 && d.budgets.flagged.length === 0 && <p className="text-sm text-emerald-700">Todo dentro del presupuesto.</p>}
              {d.budgets.flagged.map((r) => (
                <div key={r.categoryId} className="flex items-center justify-between text-sm">
                  <span>{r.name}</span>
                  <span className={r.status === "OVER" ? "font-medium text-rose-600" : "text-amber-700"}>{r.status === "OVER" ? "Superado" : "Cerca"} · {pct.format(r.pct ?? 0)}%</span>
                </div>
              ))}
            </section>

            <section className={`${card} space-y-2`}>
              <div className="flex items-baseline justify-between"><h2 className="font-semibold">Te deben</h2><Link to="/personas" className="text-xs text-slate-500 underline">Ver personas</Link></div>
              {d.debtors.length === 0 && <p className="text-sm text-slate-500">Nadie te debe nada a esta fecha.</p>}
              {d.debtors.map((p) => <div key={p.personId} className="flex justify-between text-sm"><span>{p.name}</span><span className="tabular-nums">{formatMoney(p.balance)}</span></div>)}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
