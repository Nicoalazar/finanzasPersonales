import { useState, type FormEvent } from "react";
import { iconBtnDanger } from "../components/Stats";
import { currentMonth, formatMoney, monthLabel, today } from "../lib/format";
import {
  useAccounts, useAddCharge, useAddPayment, useDeleteCharge, useDeletePayment, usePersonDetail, usePersonsSummary,
} from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;

function Detail({ id }: { id: string }) {
  const { data: d } = usePersonDetail(id);
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const addPayment = useAddPayment(id);
  const delPayment = useDeletePayment(id);
  const addCharge = useAddCharge(id);
  const delCharge = useDeleteCharge(id);
  const [pay, setPay] = useState({ date: today(), amount: "", accountId: "", note: "" });
  const [charge, setCharge] = useState({ description: "", total: "", count: "1", firstMonth: currentMonth() });
  const [showCharge, setShowCharge] = useState(false);
  const [error, setError] = useState("");
  const now = currentMonth();

  const guard = (fn: () => Promise<unknown>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  if (!d) return <p className="text-sm text-slate-500">Cargando…</p>;
  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}

      <form className="grid grid-cols-2 items-center gap-2 rounded-xl bg-white p-3 shadow sm:flex sm:flex-wrap"
        onSubmit={guard(async () => {
          await addPayment.mutateAsync({ date: pay.date, amount: parseNum(pay.amount), accountId: pay.accountId || accounts[0]?.id || "", note: pay.note });
          setPay({ ...pay, amount: "", note: "" });
        })}>
        <span className="col-span-2 text-sm font-medium">Registrar pago</span>
        <input className={field} type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} required />
        <NumberInput className={`${field} sm:w-28`} placeholder="Monto" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} required />
        <select className={`${field} col-span-2`} value={pay.accountId || accounts[0]?.id || ""} onChange={(e) => setPay({ ...pay, accountId: e.target.value })} aria-label="Cuenta donde entra">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className={`${field} col-span-2 sm:flex-1`} placeholder="Nota (opcional)" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
        <button className="col-span-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={accounts.length === 0}>Guardar</button>
        <p className="col-span-2 w-full text-xs text-slate-500">Se carga como ingreso en la categoría “Reintegros” de la cuenta elegida.</p>
      </form>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Detalle por mes</h3>
          {!showCharge && <button className="rounded bg-white px-3 py-1 text-sm shadow" onClick={() => setShowCharge(true)}>+ Cargo manual</button>}
        </div>
        {showCharge && (
          <form className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow"
            onSubmit={guard(async () => {
              await addCharge.mutateAsync({ description: charge.description, totalAmount: parseNum(charge.total), installmentCount: Math.max(1, Number(charge.count) || 1), firstMonth: charge.firstMonth });
              setShowCharge(false);
              setCharge({ description: "", total: "", count: "1", firstMonth: currentMonth() });
            })}>
            <input className={`${field} flex-1`} placeholder="Descripción (ej. Liquidación final)" value={charge.description} onChange={(e) => setCharge({ ...charge, description: e.target.value })} required />
            <NumberInput className={`${field} w-28`} placeholder="Total" value={charge.total} onChange={(v) => setCharge({ ...charge, total: v })} required />
            <label className="text-xs text-slate-500">Cuotas <input className={`${field} w-16`} type="number" min={1} max={60} value={charge.count} onChange={(e) => setCharge({ ...charge, count: e.target.value })} /></label>
            <label className="text-xs text-slate-500">Desde <input className={field} type="month" value={charge.firstMonth} onChange={(e) => setCharge({ ...charge, firstMonth: e.target.value })} required /></label>
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Guardar</button>
            <button type="button" className="text-sm text-slate-500" onClick={() => setShowCharge(false)}>Cancelar</button>
          </form>
        )}
        {d.months.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow">Sin deudas registradas. Asignale una parte al cargar una compra con tarjeta, o creá un cargo manual.</p>}
        {d.months.map((m) => (
          <div key={m.month} className={`rounded-xl bg-white shadow ${m.month > now ? "opacity-70" : ""}`}>
            <div className="flex justify-between gap-3 border-b px-4 py-2 text-sm font-medium">
              <span>{monthLabel(m.month)}{m.month > now && " · próximo"}</span><span>{formatMoney(m.total)}</span>
            </div>
            {m.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 pl-4 pr-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{l.description}</div>
                  <div className="text-xs text-slate-500">{l.source}{l.kind !== "RECURRING" && ` · cuota ${l.number}/${l.count}`}</div>
                </div>
                <span className="shrink-0 tabular-nums">{formatMoney(l.amount)}</span>
                {l.kind !== "CHARGE" && <span className="w-8 shrink-0" aria-hidden />}
                {l.kind === "CHARGE" && (
                  <button className={iconBtnDanger} aria-label="Eliminar cargo" title="Elimina el cargo completo"
                    onClick={() => confirm(`¿Eliminar el cargo "${l.description}" completo?`) && guard(() => delCharge.mutateAsync(l.refId))()}>✕</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      {d.payments.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold">Pagos recibidos</h3>
          <div className="divide-y rounded-xl bg-white shadow">
            {d.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2 text-sm">
                <span className="w-24 text-xs text-slate-500">{p.date}</span>
                <span className="flex-1 truncate text-slate-600">{p.note}</span>
                <span className="font-medium text-emerald-600">{formatMoney(p.amount)}</span>
                <button className={iconBtnDanger} aria-label="Eliminar pago" title="También elimina el ingreso"
                  onClick={() => confirm("¿Eliminar el pago? También se elimina el ingreso asociado.") && guard(() => delPayment.mutateAsync(p.id))()}>✕</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function Persons() {
  const people = usePersonsSummary().data ?? [];
  const [selected, setSelected] = useState<string>();
  const current = people.find((p) => p.personId === selected) ?? people[0];

  if (people.length === 0)
    return <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Todavía no hay personas. Creá una al cargar una compra con tarjeta repartida.</p>;

  return (
    <main className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {people.map((p) => (
          <button key={p.personId} onClick={() => setSelected(p.personId)}
            className={`rounded-xl p-4 text-left shadow ${p.personId === current?.personId ? "bg-slate-900 text-white" : "bg-white"}`}>
            <div className="text-sm opacity-80">{p.name}</div>
            <div className="text-lg font-semibold">{p.balance >= 0 ? "Te debe " : "A favor "}{formatMoney(Math.abs(p.balance))}</div>
            <div className="text-xs opacity-70">Devengado {formatMoney(p.accrued)} · Pagado {formatMoney(p.paid)}{p.upcoming > 0 && ` · Próximas ${formatMoney(p.upcoming)}`}</div>
          </button>
        ))}
      </section>
      {current && <Detail key={current.personId} id={current.personId} />}
    </main>
  );
}
