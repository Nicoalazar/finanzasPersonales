import { useState, type FormEvent } from "react";
import { dateInMonth, type AccountDto, type JobDto, type PayslipDto } from "@finanzas/shared";
import { StatRow, iconBtn, iconBtnDanger } from "../components/Stats";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import {
  useAccounts, useCreateJob, useCreatePayslip, useDeleteJob, useDeletePayslip, useJobs, usePatchJob, usePatchPayslip, usePayslips, useSacSuggestion,
} from "../lib/queries";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;
const pctFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const errMsg = (err: unknown) => (err instanceof Error ? err.message : "Error");

/** El sueldo de un mes se cobra el mes siguiente; el SAC, dentro del mismo mes. */
const defaultDate = (month: string, kind: "MONTHLY" | "SAC") => (kind === "SAC" ? dateInMonth(month, 30) : `${shiftMonth(month, 1)}-01`);

/** Cuenta donde se cobra por defecto: la del trabajo; si es en negro y no tiene, la primera de efectivo. */
const defaultAccount = (job: JobDto | undefined, accounts: AccountDto[]) =>
  (job?.accountId && accounts.some((a) => a.id === job.accountId) ? job.accountId : undefined)
  ?? (job?.informal ? accounts.find((a) => a.kind === "CASH")?.id : undefined)
  ?? accounts[0]?.id ?? "";

const InformalBadge = () => <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">En negro</span>;

function JobForm({ job, accounts, onDone }: { job?: JobDto; accounts: AccountDto[]; onDone: () => void }) {
  const create = useCreateJob();
  const patch = usePatchJob();
  const [name, setName] = useState(job?.name ?? "");
  const [informal, setInformal] = useState(job?.informal ?? false);
  const [accountId, setAccountId] = useState(job?.accountId ?? "");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const v = { name, informal, accountId: accountId || null };
    try {
      await (job ? patch.mutateAsync({ id: job.id, patch: v }) : create.mutateAsync(v));
      onDone();
    } catch (err) { setError(errMsg(err)); }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-4 py-3 text-sm">
      <label className="text-xs text-slate-500">Nombre <input className={`${field} block w-44`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Facultad" required autoFocus /></label>
      <label className="text-xs text-slate-500">Se cobra en
        <select className={`${field} block`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{informal ? "Efectivo (la primera cuenta de efectivo)" : "Elegir al cargar"}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={informal} onChange={(e) => setInformal(e.target.checked)} /> En negro (solo neto)</label>
      <button className="rounded bg-slate-900 px-3 py-1.5 text-white" disabled={create.isPending || patch.isPending}>Guardar</button>
      <button type="button" className="text-slate-500" onClick={onDone}>Cancelar</button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </form>
  );
}

function Jobs({ jobs, accounts }: { jobs: JobDto[]; accounts: AccountDto[] }) {
  const patch = usePatchJob();
  const del = useDeleteJob();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const creating = editing === "new" || jobs.length === 0; // sin trabajos, el alta queda abierta
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Trabajos</h2>
        {!creating && <button className="text-sm text-slate-600 underline" onClick={() => setEditing("new")}>+ Trabajo</button>}
      </div>
      <div className="divide-y rounded-xl bg-white shadow">
        {jobs.length === 0 && <p className="px-4 pt-3 text-sm text-slate-500">Cargá primero los trabajos de los que cobrás sueldo.</p>}
        {jobs.map((j) => editing === j.id ? <JobForm key={j.id} job={j} accounts={accounts} onDone={() => setEditing(null)} /> : (
          <div key={j.id} className={`flex items-center gap-1 py-2 pl-4 pr-2 text-sm ${j.archived ? "opacity-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{j.name}</span>
                {j.informal && <InformalBadge />}
                {j.archived && <span className="text-xs text-slate-500">archivado</span>}
              </div>
              <div className="text-xs text-slate-500">{accountName(j.accountId) ? `Se cobra en ${accountName(j.accountId)} · ` : ""}{j.payslipCount} {j.payslipCount === 1 ? "recibo" : "recibos"}</div>
            </div>
            <button className={iconBtn} aria-label="Editar" onClick={() => setEditing(j.id)}>✎</button>
            {j.payslipCount > 0 ? (
              <button className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900" onClick={() => patch.mutate({ id: j.id, patch: { archived: !j.archived } })}>
                {j.archived ? "Reactivar" : "Archivar"}
              </button>
            ) : (
              <button className="text-slate-400 hover:text-rose-600" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar ${j.name}?`) && del.mutate(j.id)}>✕</button>
            )}
          </div>
        ))}
        {creating && <JobForm accounts={accounts} onDone={() => setEditing(null)} />}
      </div>
    </section>
  );
}

function NewPayslip({ jobs, accounts, onDone }: { jobs: JobDto[]; accounts: AccountDto[]; onDone: () => void }) {
  const create = useCreatePayslip();
  const [jobId, setJobId] = useState(jobs[0]!.id);
  const job = jobs.find((j) => j.id === jobId);
  const [month, setMonth] = useState(currentMonth());
  const [kind, setKind] = useState<"MONTHLY" | "SAC">("MONTHLY");
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState<string>();
  const [paid, setPaid] = useState(true);
  const [error, setError] = useState("");
  const suggestion = useSacSuggestion(month, jobId, kind === "SAC").data;
  const informal = !!job?.informal;
  const account = accountId || defaultAccount(job, accounts);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await create.mutateAsync({
        jobId, month, kind, ...(informal ? {} : { gross: parseNum(gross) }), net: parseNum(net),
        date: date ?? defaultDate(month, kind), accountId: account, paid,
      });
      onDone();
    } catch (err) { setError(errMsg(err)); }
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
      <label className="text-xs text-slate-500">Trabajo
        <select className={`${field} w-full`} value={jobId} onChange={(e) => { setJobId(e.target.value); setAccountId(""); }}>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{j.informal ? " (en negro)" : ""}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Mes del recibo <input className={`${field} w-full`} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDate(undefined); }} required /></label>
      {!informal && <label className="text-xs text-slate-500">Bruto <input className={`${field} w-full`} inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} required /></label>}
      <label className="text-xs text-slate-500">Neto (lo que cobrás) <input className={`${field} w-full`} inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} required /></label>
      <label className="text-xs text-slate-500">Cuenta
        <select className={`${field} w-full`} value={account} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Fecha de cobro <input className={`${field} w-full`} type="date" value={date ?? defaultDate(month, kind)} onChange={(e) => setDate(e.target.value)} required /></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Ya cobrado</label>
      {kind === "SAC" && suggestion && (
        <p className="col-span-2 self-end pb-2 text-xs text-slate-500">
          {suggestion.suggested == null ? "No hay sueldos de este trabajo en el semestre para sugerir el monto." : (
            <>{suggestion.basis === "net" ? "Neto" : "Bruto"} sugerido: <b>{formatMoney(suggestion.suggested)}</b> (mitad del mayor {suggestion.basis === "net" ? "neto" : "bruto"} del semestre){" "}
              <button type="button" className="underline" onClick={() => (suggestion.basis === "net" ? setNet : setGross)(String(suggestion.suggested))}>Usar</button></>
          )}
        </p>
      )}
      <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">
        {informal && "En negro: no hay bruto ni descuentos, solo lo que cobrás. "}
        Se carga un ingreso por el neto en la fecha de cobro ({kind === "MONTHLY" ? "el sueldo de un mes se cobra el mes siguiente" : "el SAC se cobra en el mismo mes"}); podés cambiarla.
      </p>
      {accounts.length === 0 && <p className="col-span-2 text-sm text-amber-700 sm:col-span-4">Primero creá la cuenta donde cobrás (banco o efectivo), en Configuración.</p>}
      {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-4">{error}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white" disabled={create.isPending || !account}>Guardar</button>
        <button type="button" className="text-sm text-slate-500" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

function Row({ p, job, prevNet }: { p: PayslipDto; job: JobDto | undefined; prevNet: number | null }) {
  const patch = usePatchPayslip();
  const del = useDeletePayslip();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ gross: String(p.gross ?? ""), net: String(p.net), date: p.date ?? "" });
  const [error, setError] = useState("");
  const change = prevNet ? ((p.net - prevNet) / prevNet) * 100 : null;
  const informal = p.gross == null;

  const save = async () => {
    setError("");
    try {
      await patch.mutateAsync({ id: p.id, patch: { ...(informal ? {} : { gross: parseNum(f.gross) }), net: parseNum(f.net), ...(f.date ? { date: f.date } : {}) } });
      setEditing(false);
    } catch (err) { setError(errMsg(err)); }
  };

  const title = (
    <span className="min-w-0 truncate sm:w-44">
      {job?.name ?? "—"}
      {p.kind === "SAC" && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-700">SAC</span>}
    </span>
  );
  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        {title}
        {!informal && <input className={`${field} w-32`} inputMode="decimal" value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} aria-label="Bruto" />}
        <input className={`${field} w-32`} inputMode="decimal" value={f.net} onChange={(e) => setF({ ...f, net: e.target.value })} aria-label="Neto" />
        <input className={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Fecha de cobro" />
        <button className="rounded bg-slate-900 px-3 py-1 text-white" onClick={save}>Guardar</button>
        <button className="text-slate-500" onClick={() => setEditing(false)}>Cancelar</button>
        {error && <span className="text-red-600">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 py-2 pl-4 pr-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {title}
          <span className="shrink-0 font-medium tabular-nums">Neto {formatMoney(p.net)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{informal ? <InformalBadge /> : `Bruto ${formatMoney(p.gross!)}`}</span>
          {p.gross && <span title="Neto sobre bruto">{Math.round((p.net / p.gross) * 100)}% del bruto</span>}
          {change != null && (
            <span className={change >= 0 ? "text-emerald-600" : "text-rose-600"} title="Variación del neto contra el recibo anterior de este trabajo">{pctFmt.format(change)}% vs. anterior</span>
          )}
          {p.status === "PENDING" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Sin cobrar</span>}
        </div>
      </div>
      <button className={iconBtn} aria-label="Editar" onClick={() => setEditing(true)}>✎</button>
      <button className={iconBtnDanger} aria-label="Eliminar" title="También elimina el ingreso"
        onClick={() => confirm("¿Eliminar este recibo? También se elimina el ingreso asociado.") && del.mutate(p.id)}>✕</button>
    </div>
  );
}

export function Salary() {
  const all = usePayslips().data ?? [];
  const jobsQuery = useJobs();
  const jobs = jobsQuery.data ?? [];
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const [adding, setAdding] = useState(false);
  const [jobFilter, setJobFilter] = useState("");
  const activeJobs = jobs.filter((j) => !j.archived);
  const jobOf = (id: string) => jobs.find((j) => j.id === id);
  const payslips = jobFilter ? all.filter((p) => p.jobId === jobFilter) : all;

  // totales por mes de sueldo (sumando todos los trabajos), más nuevo primero
  const totals = new Map<string, number>();
  for (const p of payslips) if (p.kind === "MONTHLY") totals.set(p.month, (totals.get(p.month) ?? 0) + p.net);
  const months = [...totals.keys()].sort().reverse();
  const last = months[0];
  const lastNet = last ? totals.get(last)! : 0;
  const prevTotal = months[1] ? totals.get(months[1])! : null;
  const lastChange = prevTotal ? ((lastNet - prevTotal) / prevTotal) * 100 : null;
  const recent = months.slice(0, 12);
  const avg = recent.length ? recent.reduce((a, m) => a + totals.get(m)!, 0) / recent.length : 0;

  // el recibo anterior del mismo trabajo y tipo, para la variación
  const prevNet = (p: PayslipDto) => all.find((x) => x.jobId === p.jobId && x.kind === p.kind && x.month < p.month)?.net ?? null;
  const groups = [...new Set(payslips.map((p) => p.month))];

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sueldos</h1>
        {!adding && activeJobs.length > 0 && <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={() => setAdding(true)}>+ Recibo</button>}
      </div>
      {adding && <NewPayslip jobs={activeJobs} accounts={accounts} onDone={() => setAdding(false)} />}

      {jobs.length > 1 && (
        <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ id: "", name: "Todos" }, ...jobs].map((j) => (
            <button key={j.id} onClick={() => setJobFilter(j.id)} className={`shrink-0 rounded px-3 py-1 text-sm ${jobFilter === j.id ? "bg-slate-900 text-white" : "bg-white shadow"}`}>{j.name}</button>
          ))}
        </div>
      )}

      {last && (
        <StatRow items={[
          { label: `Último neto${jobFilter ? "" : " total"} · ${monthLabel(last)}`, value: formatMoney(lastNet) },
          { label: "Vs. mes anterior", value: lastChange == null ? "—" : `${pctFmt.format(lastChange)}%`, cls: lastChange == null ? "" : lastChange >= 0 ? "text-emerald-600" : "text-rose-600" },
          { label: `Neto promedio (${recent.length} ${recent.length === 1 ? "mes" : "meses"})`, value: formatMoney(avg) },
        ]} />
      )}

      {all.length === 0 && activeJobs.length > 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow">Todavía no cargaste recibos. Con el bruto y el neto de cada mes alcanza (en los trabajos en negro, solo el neto): el neto se carga solo como ingreso.</p>}
      {groups.map((m) => {
        const rows = payslips.filter((p) => p.month === m);
        const total = rows.reduce((a, p) => a + p.net, 0);
        return (
          <section key={m}>
            <h2 className="mb-1 flex justify-between text-sm font-semibold text-slate-500">
              <span>{monthLabel(m)}</span>
              {rows.length > 1 && <span>Total neto {formatMoney(total)}</span>}
            </h2>
            <div className="divide-y rounded-xl bg-white shadow">
              {rows.map((p) => <Row key={p.id} p={p} job={jobOf(p.jobId)} prevNet={prevNet(p)} />)}
            </div>
          </section>
        );
      })}

      {jobsQuery.isSuccess && <Jobs jobs={jobs} accounts={accounts} />}
    </main>
  );
}
