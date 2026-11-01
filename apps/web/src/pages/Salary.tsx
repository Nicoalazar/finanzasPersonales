import { useState, type FormEvent } from "react";
import { dateInMonth, type PayslipDto } from "@finanzas/shared";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import { useAccounts, useCreatePayslip, useDeletePayslip, usePatchPayslip, usePayslips, useSacSuggestion } from "../lib/queries";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;
const pctFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

/** El sueldo de un mes se cobra el mes siguiente; el SAC, dentro del mismo mes. */
const defaultDate = (month: string, kind: "MONTHLY" | "SAC") => (kind === "SAC" ? dateInMonth(month, 30) : `${shiftMonth(month, 1)}-01`);

function NewPayslip({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const create = useCreatePayslip();
  const [month, setMonth] = useState(currentMonth());
  const [kind, setKind] = useState<"MONTHLY" | "SAC">("MONTHLY");
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState<string>();
  const [paid, setPaid] = useState(true);
  const [error, setError] = useState("");
  const suggestion = useSacSuggestion(month, kind === "SAC").data;

  if (accounts.length === 0) return <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Primero creá la cuenta donde cobrás el sueldo, en Configuración.</p>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await create.mutateAsync({ month, kind, gross: parseNum(gross), net: parseNum(net), date: date ?? defaultDate(month, kind), accountId: accountId || accounts[0]!.id, paid });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow sm:grid-cols-4">
      <div className="col-span-2 flex gap-1 sm:col-span-4">
        {(["MONTHLY", "SAC"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setDate(undefined); }} className={`rounded px-3 py-1 text-sm ${kind === k ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
            {k === "MONTHLY" ? "Sueldo" : "SAC (aguinaldo)"}
          </button>
        ))}
      </div>
      <label className="text-xs text-slate-500">Mes del recibo <input className={`${field} w-full`} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDate(undefined); }} required /></label>
      <label className="text-xs text-slate-500">Bruto <input className={`${field} w-full`} inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} required /></label>
      <label className="text-xs text-slate-500">Neto (lo que cobrás) <input className={`${field} w-full`} inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} required /></label>
      <label className="text-xs text-slate-500">Cuenta
        <select className={`${field} w-full`} value={accountId || accounts[0]!.id} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Fecha de cobro <input className={`${field} w-full`} type="date" value={date ?? defaultDate(month, kind)} onChange={(e) => setDate(e.target.value)} required /></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Ya cobrado</label>
      {kind === "SAC" && suggestion && (
        <p className="col-span-2 self-end pb-2 text-xs text-slate-500">
          {suggestion.suggestedGross == null ? "No hay sueldos cargados en este semestre para sugerir el bruto." : (
            <>Bruto sugerido: <b>{formatMoney(suggestion.suggestedGross)}</b> (mitad del mayor bruto del semestre){" "}
              <button type="button" className="underline" onClick={() => setGross(String(suggestion.suggestedGross))}>Usar</button></>
          )}
        </p>
      )}
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">Se carga un ingreso por el neto en la fecha de cobro ({kind === "MONTHLY" ? "el sueldo de un mes se cobra el mes siguiente" : "el SAC se cobra en el mismo mes"}); podés cambiarla.</p>
      {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-4">{error}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white" disabled={create.isPending}>Guardar</button>
        <button type="button" className="text-sm text-slate-500" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

function Row({ p, prevNet }: { p: PayslipDto; prevNet: number | null }) {
  const patch = usePatchPayslip();
  const del = useDeletePayslip();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ gross: String(p.gross), net: String(p.net), date: p.date ?? "" });
  const [error, setError] = useState("");
  const change = prevNet ? ((p.net - prevNet) / prevNet) * 100 : null;

  const save = async () => {
    setError("");
    try {
      await patch.mutateAsync({ id: p.id, patch: { gross: parseNum(f.gross), net: parseNum(f.net), ...(f.date ? { date: f.date } : {}) } });
      setEditing(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <span className="w-32">{monthLabel(p.month)}</span>
        <input className={`${field} w-32`} inputMode="decimal" value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} aria-label="Bruto" />
        <input className={`${field} w-32`} inputMode="decimal" value={f.net} onChange={(e) => setF({ ...f, net: e.target.value })} aria-label="Neto" />
        <input className={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Fecha de cobro" />
        <button className="rounded bg-slate-900 px-3 py-1 text-white" onClick={save}>Guardar</button>
        <button className="text-slate-500" onClick={() => setEditing(false)}>Cancelar</button>
        {error && <span className="text-red-600">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span className="w-32">{monthLabel(p.month)}{p.kind === "SAC" && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-700">SAC</span>}</span>
      <span className="flex-1 text-slate-500">Bruto {formatMoney(p.gross)}</span>
      <span className="font-medium">Neto {formatMoney(p.net)}</span>
      <span className="w-14 text-right text-xs text-slate-500" title="Neto sobre bruto">{p.gross > 0 ? `${Math.round((p.net / p.gross) * 100)}%` : ""}</span>
      <span className={`w-16 text-right text-xs ${change == null ? "" : change >= 0 ? "text-emerald-600" : "text-rose-600"}`} title="Variación del neto contra el recibo anterior">
        {change == null ? "" : `${pctFmt.format(change)}%`}
      </span>
      {p.status === "PENDING" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Sin cobrar</span>}
      <button className="text-slate-400 hover:text-slate-900" aria-label="Editar" onClick={() => setEditing(true)}>✎</button>
      <button className="text-slate-400 hover:text-rose-600" aria-label="Eliminar" title="También elimina el ingreso"
        onClick={() => confirm("¿Eliminar este recibo? También se elimina el ingreso asociado.") && del.mutate(p.id)}>✕</button>
    </div>
  );
}

export function Salary() {
  const payslips = usePayslips().data ?? [];
  const [adding, setAdding] = useState(false);
  const monthly = payslips.filter((p) => p.kind === "MONTHLY"); // más nuevo primero
  const last = monthly[0];
  const lastChange = last && monthly[1] ? ((last.net - monthly[1].net) / monthly[1].net) * 100 : null;
  const recent = monthly.slice(0, 12);
  const avg = recent.length ? recent.reduce((a, p) => a + p.net, 0) / recent.length : 0;

  // el recibo anterior del mismo tipo, para la variación
  const prevNet = (p: PayslipDto) => payslips.find((x) => x.kind === p.kind && x.month < p.month)?.net ?? null;
  const years = [...new Set(payslips.map((p) => p.month.slice(0, 4)))];

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sueldos</h1>
        {!adding && <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={() => setAdding(true)}>+ Recibo</button>}
      </div>
      {adding && <NewPayslip onDone={() => setAdding(false)} />}

      {last && (
        <section className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-white p-3 shadow"><div className="text-xs text-slate-500">Último neto · {monthLabel(last.month)}</div><div className="font-semibold">{formatMoney(last.net)}</div></div>
          <div className="rounded-xl bg-white p-3 shadow"><div className="text-xs text-slate-500">Vs. mes anterior</div>
            <div className={`font-semibold ${lastChange == null ? "" : lastChange >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{lastChange == null ? "—" : `${pctFmt.format(lastChange)}%`}</div></div>
          <div className="rounded-xl bg-white p-3 shadow"><div className="text-xs text-slate-500">Neto promedio ({recent.length} {recent.length === 1 ? "mes" : "meses"})</div><div className="font-semibold">{formatMoney(avg)}</div></div>
        </section>
      )}

      {payslips.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow">Todavía no cargaste recibos. Con el bruto y el neto de cada mes alcanza: el neto se carga solo como ingreso.</p>}
      {years.map((y) => (
        <section key={y}>
          <h2 className="mb-1 text-sm font-semibold text-slate-500">{y}</h2>
          <div className="divide-y rounded-xl bg-white shadow">
            {payslips.filter((p) => p.month.startsWith(y)).map((p) => <Row key={p.id} p={p} prevNet={prevNet(p)} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
