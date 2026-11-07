import { useState } from "react";
import type { InvestmentAccountDto } from "@finanzas/shared";
import { StatRow, iconBtnDanger } from "../components/Stats";
import { formatDay, formatMoney, today } from "../lib/format";
import { useAccounts, useAddInvestmentMovement, useAddSnapshot, useDeleteSnapshot, useDeleteTransaction, useInvestments } from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;
const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
const tone = (n: number | null) => (n == null || n === 0 ? "" : n > 0 ? "text-emerald-600" : "text-rose-600");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatMoney(Math.abs(n))}`;

function Stat({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function AccountPanel({ a }: { a: InvestmentAccountDto }) {
  const others = (useAccounts().data ?? []).filter((x) => !x.archived && x.id !== a.accountId);
  const addSnap = useAddSnapshot();
  const delSnap = useDeleteSnapshot();
  const addMove = useAddInvestmentMovement();
  const delTx = useDeleteTransaction();
  const [snap, setSnap] = useState({ date: today(), balance: "" });
  const [mov, setMov] = useState({ kind: "DEPOSIT" as "DEPOSIT" | "WITHDRAWAL", otherAccountId: "", date: today(), amount: "" });
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const guard = (fn: () => Promise<unknown>) => async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };
  const nameOf = (id: string) => others.find((x) => x.id === id)?.name ?? "otra cuenta";
  const moves = showAll ? a.movements : a.movements.slice(0, 5);

  return (
    <section className="space-y-4 rounded-xl bg-white p-4 shadow">
      <h2 className="text-lg font-semibold">{a.name}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Depositado (teórico)" value={formatMoney(a.theoretical)} sub={`Dep. ${formatMoney(a.deposits)} · Ret. ${formatMoney(a.withdrawals)}`} />
        <Stat label="Saldo real" value={a.lastSnapshot ? formatMoney(a.lastSnapshot.real) : "—"} sub={a.lastSnapshot ? `al ${a.lastSnapshot.date}` : "Anotá tu primer saldo"} />
        <Stat label="Ganancia" value={a.gain == null ? "—" : signed(a.gain)} sub={a.gainPct == null ? undefined : `${pct.format(a.gainPct)}% sobre lo depositado`} cls={tone(a.gain)} />
        <Stat label="Estimado hoy" value={formatMoney(a.currentEstimate)} sub="último real + movimientos posteriores" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <form className="space-y-2 rounded-lg border p-3" onSubmit={guard(async () => { await addSnap.mutateAsync({ accountId: a.accountId, date: snap.date, balance: parseNum(snap.balance) }); setSnap({ ...snap, balance: "" }); })}>
          <div className="text-sm font-medium">Anotar saldo real</div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <input className={field} type="date" value={snap.date} onChange={(e) => setSnap({ ...snap, date: e.target.value })} required aria-label="Fecha del saldo" />
            <NumberInput className={`${field} sm:w-36`} placeholder="Saldo real" value={snap.balance} onChange={(v) => setSnap({ ...snap, balance: v })} required />
            <button className="col-span-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Guardar</button>
          </div>
          <p className="text-xs text-slate-500">Si ya anotaste esa fecha, se reemplaza.</p>
        </form>

        <form className="space-y-2 rounded-lg border p-3" onSubmit={guard(async () => {
          await addMove.mutateAsync({ accountId: a.accountId, kind: mov.kind, otherAccountId: mov.otherAccountId || others[0]!.id, date: mov.date, amount: parseNum(mov.amount) });
          setMov({ ...mov, amount: "" });
        })}>
          <div className="flex gap-1">
            {(["DEPOSIT", "WITHDRAWAL"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setMov({ ...mov, kind: k })} className={`rounded px-3 py-1 text-sm ${mov.kind === k ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
                {k === "DEPOSIT" ? "Depósito" : "Retiro"}
              </button>
            ))}
          </div>
          {others.length === 0 ? <p className="text-xs text-amber-700">Necesitás otra cuenta (de donde sale o a donde va la plata).</p> : (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <select className={`${field} col-span-2`} value={mov.otherAccountId || others[0]!.id} onChange={(e) => setMov({ ...mov, otherAccountId: e.target.value })} aria-label={mov.kind === "DEPOSIT" ? "Sale de" : "Va a"}>
                {others.map((x) => <option key={x.id} value={x.id}>{mov.kind === "DEPOSIT" ? "Desde " : "Hacia "}{x.name}</option>)}
              </select>
              <input className={field} type="date" value={mov.date} onChange={(e) => setMov({ ...mov, date: e.target.value })} required aria-label="Fecha" />
              <NumberInput className={`${field} sm:w-32`} placeholder="Monto" value={mov.amount} onChange={(v) => setMov({ ...mov, amount: v })} required />
              <button className="col-span-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Guardar</button>
            </div>
          )}
        </form>
      </div>
      {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}

      {a.snapshots.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="py-1 font-normal">Fecha</th><th className="font-normal">Teórico</th><th className="font-normal">Real</th><th className="font-normal">Ganancia</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {a.snapshots.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">{s.date}</td><td>{formatMoney(s.theoretical)}</td><td>{formatMoney(s.real)}</td>
                  <td className={tone(s.gain)}>{signed(s.gain)}</td>
                  <td><button className="text-slate-400 hover:text-rose-600" aria-label="Eliminar saldo" onClick={() => confirm("¿Eliminar este saldo real?") && guard(() => delSnap.mutateAsync(s.id))()}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {a.movements.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">Depósitos y retiros</div>
          <div className="divide-y rounded-lg border">
            {moves.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-1 pl-3 pr-1 text-sm">
                <span className="w-12 text-xs text-slate-500">{formatDay(m.date)}</span>
                <span className="flex-1 truncate">
                  {m.kind === "DEPOSIT" ? `Depósito desde ${nameOf(m.otherAccountId)}`
                    : m.kind === "WITHDRAWAL" ? `Retiro hacia ${nameOf(m.otherAccountId)}`
                    : `${m.kind === "INCOME" ? "Ingreso" : "Gasto"}${m.description ? `: ${m.description}` : ""}`}
                </span>
                <span className={m.kind === "DEPOSIT" || m.kind === "INCOME" ? "" : "text-rose-600"}>{m.kind === "DEPOSIT" || m.kind === "INCOME" ? "" : "−"}{formatMoney(m.amount)}</span>
                <button className={iconBtnDanger} aria-label="Eliminar movimiento" onClick={() => confirm(m.kind === "INCOME" || m.kind === "EXPENSE" ? "¿Eliminar este movimiento?" : "¿Eliminar este movimiento? Se revierte en las dos cuentas.") && guard(() => delTx.mutateAsync(m.id))()}>✕</button>
              </div>
            ))}
          </div>
          {a.movements.length > 5 && <button className="mt-1 text-xs text-slate-500 underline" onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos" : `Ver los ${a.movements.length}`}</button>}
        </div>
      )}
    </section>
  );
}

export function Investments() {
  const { data } = useInvestments();
  if (!data) return null;
  if (data.accounts.length === 0)
    return <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Creá una cuenta de tipo <b>Inversión</b> (Brubank, Ppay, MercadoPago…) en Configuración para empezar a registrar depósitos, retiros y saldos reales.</p>;
  const t = data.totals;
  return (
    <main className="space-y-4">
      <StatRow items={[
        { label: "Depositado", value: formatMoney(t.theoretical) },
        { label: "Estimado hoy", value: formatMoney(t.currentEstimate) },
        { label: "Ganancia", value: signed(t.gain), cls: tone(t.gain) },
      ]} />
      {data.accounts.map((a) => <AccountPanel key={a.accountId} a={a} />)}
    </main>
  );
}
