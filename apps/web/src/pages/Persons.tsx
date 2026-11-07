import { useState, type FormEvent } from "react";
import { iconBtnDanger } from "../components/Stats";
import { currentMonth, formatMoney, monthLabel, today } from "../lib/format";
import {
  useAccounts, useAddCharge, useAddPayment, useCategories, useCreatePerson, useDeleteCharge, useDeletePayment, usePersonDetail, usePersonsSummary,
} from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "field";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;
const toggle = (on: boolean) => `${on ? "seg-on" : "seg-off"} py-1`;

function NewPerson({ onDone }: { onDone: (id: string) => void }) {
  const create = useCreatePerson();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try { const p = await create.mutateAsync(name.trim()); setName(""); onDone(p.id); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
      }}>
      <input className={`${field} w-48`} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Nombre de la persona" />
      <button className="btn-primary" disabled={create.isPending}>{create.isPending ? "Creando…" : "+ Persona"}</button>
      {error && <span role="alert" className="text-sm text-neg">{error}</span>}
    </form>
  );
}

function Detail({ id }: { id: string }) {
  const { data: d } = usePersonDetail(id);
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const addPayment = useAddPayment(id);
  const delPayment = useDeletePayment(id);
  const addCharge = useAddCharge(id);
  const delCharge = useDeleteCharge(id);
  const categories = useCategories().data?.filter((c) => c.type === "EXPENSE") ?? [];
  const [pay, setPay] = useState({ direction: "IN" as "IN" | "OUT", date: today(), amount: "", accountId: "", note: "" });
  const [charge, setCharge] = useState({ direction: "THEY_OWE" as "THEY_OWE" | "I_OWE", categoryId: "", description: "", total: "", count: "1", firstMonth: currentMonth() });
  const owe = charge.direction === "I_OWE";
  const payIn = pay.direction === "IN";
  const [showCharge, setShowCharge] = useState(false);
  const [error, setError] = useState("");
  const now = currentMonth();

  const guard = (fn: () => Promise<unknown>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  if (!d) return <p className="text-sm text-muted">Cargando…</p>;
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded bg-neg-soft p-2 text-sm text-neg">{error}</p>}

      <form className="card grid grid-cols-2 items-center gap-2 p-3 sm:flex sm:flex-wrap"
        onSubmit={guard(async () => {
          await addPayment.mutateAsync({ direction: pay.direction, date: pay.date, amount: parseNum(pay.amount), accountId: pay.accountId || accounts[0]?.id || "", note: pay.note });
          setPay({ ...pay, amount: "", note: "" });
        })}>
        <span className="col-span-2 flex flex-wrap items-center gap-1 text-sm font-medium">Registrar pago
          <button type="button" className={toggle(payIn)} onClick={() => setPay({ ...pay, direction: "IN" })}>Me pagó</button>
          <button type="button" className={toggle(!payIn)} onClick={() => setPay({ ...pay, direction: "OUT" })}>Le pagué</button>
        </span>
        <input className={field} type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} required />
        <NumberInput className={`${field} sm:w-28`} placeholder="Monto" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} required />
        <select className={`${field} col-span-2`} value={pay.accountId || accounts[0]?.id || ""} onChange={(e) => setPay({ ...pay, accountId: e.target.value })} aria-label={payIn ? "Cuenta donde entra" : "Cuenta de donde sale"}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className={`${field} col-span-2 sm:flex-1`} placeholder="Nota (opcional)" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
        <button className="btn-primary col-span-2" disabled={accounts.length === 0}>Guardar</button>
        <p className="col-span-2 w-full text-xs text-muted">
          {payIn ? "Se carga como ingreso en la categoría “Reintegros” de la cuenta elegida."
            : "Sale de la cuenta elegida. No vuelve a contar como gasto: ya contó en su categoría cuando cargaste lo que pagó por vos."}
        </p>
      </form>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Detalle por mes</h3>
          {!showCharge && <button className="btn-soft py-1" onClick={() => setShowCharge(true)}>+ Cargo o deuda</button>}
        </div>
        {showCharge && (
          <form className="card flex flex-wrap items-center gap-2 p-3"
            onSubmit={guard(async () => {
              await addCharge.mutateAsync({
                direction: charge.direction, categoryId: owe ? charge.categoryId || null : null, description: charge.description,
                totalAmount: parseNum(charge.total), installmentCount: Math.max(1, Number(charge.count) || 1), firstMonth: charge.firstMonth,
              });
              setShowCharge(false);
              setCharge({ ...charge, description: "", total: "", count: "1" });
            })}>
            <div className="flex w-full gap-1">
              <button type="button" className={toggle(!owe)} onClick={() => setCharge({ ...charge, direction: "THEY_OWE" })}>Me debe</button>
              <button type="button" className={toggle(owe)} onClick={() => setCharge({ ...charge, direction: "I_OWE" })}>Pagó por mí (le debo)</button>
            </div>
            <input className={`${field} flex-1`} placeholder={owe ? "Descripción (ej. Cena del sábado)" : "Descripción (ej. Liquidación final)"} value={charge.description} onChange={(e) => setCharge({ ...charge, description: e.target.value })} required />
            <NumberInput className={`${field} w-28`} placeholder="Total" value={charge.total} onChange={(v) => setCharge({ ...charge, total: v })} required />
            <label className="text-xs text-muted">Cuotas <input className={`${field} w-16`} type="number" min={1} max={60} value={charge.count} onChange={(e) => setCharge({ ...charge, count: e.target.value })} /></label>
            {owe && (
              <select className={field} value={charge.categoryId} onChange={(e) => setCharge({ ...charge, categoryId: e.target.value })} aria-label="Categoría">
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <label className="text-xs text-muted">{owe ? "Mes" : "Desde"} <input className={field} type="month" value={charge.firstMonth} onChange={(e) => setCharge({ ...charge, firstMonth: e.target.value })} required /></label>
            <button className="btn-primary">Guardar</button>
            <button type="button" className="text-sm text-muted" onClick={() => setShowCharge(false)}>Cancelar</button>
            {owe && <p className="w-full text-xs text-muted">Cuenta como gasto tuyo en esa categoría el mes de cada cuota, aunque no salga de tu cuenta. Cuando le devuelvas la plata, registralo con “Le pagué”.</p>}
          </form>
        )}
        {d.months.length === 0 && <p className="card p-4 text-sm text-muted">Sin deudas registradas. Asignale una parte al cargar una compra con tarjeta, o cargá un cargo o lo que pagó por vos.</p>}
        {d.months.map((m) => (
          <div key={m.month} className={`card ${m.month > now ? "opacity-70" : ""}`}>
            <div className="flex justify-between gap-3 border-b px-4 py-2 text-sm font-medium">
              <span>{monthLabel(m.month)}{m.month > now && " · próximo"}</span><span className={m.total < 0 ? "text-neg" : ""}>{formatMoney(m.total)}</span>
            </div>
            {m.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 pl-4 pr-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{l.description}</div>
                  <div className="text-xs text-muted">{l.source}{l.kind !== "RECURRING" && ` · cuota ${l.number}/${l.count}`}
                    {l.estimated && <span className="text-warn" title="Consumo en USD: usa la cotización estimada hasta que se cargue la del resumen"> · estimado</span>}</div>
                </div>
                <span className={`shrink-0 tabular-nums ${l.amount < 0 ? "text-neg" : ""}`}>{formatMoney(l.amount)}</span>
                {l.kind !== "CHARGE" && l.kind !== "DEBT" && <span className="w-8 shrink-0" aria-hidden />}
                {(l.kind === "CHARGE" || l.kind === "DEBT") && (
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
          <h3 className="font-semibold">Pagos</h3>
          <div className="card divide-y">
            {d.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2 text-sm">
                <span className="w-24 text-xs text-muted">{p.date}</span>
                <span className="flex-1 truncate text-muted">{p.direction === "OUT" ? "Le pagaste" : "Te pagó"}{p.note && ` · ${p.note}`}</span>
                <span className={`font-medium ${p.direction === "OUT" ? "text-neg" : "text-pos"}`}>{formatMoney(p.amount)}</span>
                <button className={iconBtnDanger} aria-label="Eliminar pago" title="También elimina el movimiento de la cuenta"
                  onClick={() => confirm("¿Eliminar el pago? También se elimina el movimiento de la cuenta.") && guard(() => delPayment.mutateAsync(p.id))()}>✕</button>
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

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Personas</h1>
        <NewPerson onDone={setSelected} />
      </div>
      {people.length === 0 && <p className="rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn-ink">Todavía no hay personas. Creá una acá o al cargar una compra con tarjeta repartida.</p>}
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {people.map((p) => (
          <button key={p.personId} onClick={() => setSelected(p.personId)}
            className={`card p-4 text-left ${p.personId === current?.personId ? "border-primary bg-primary text-white" : ""}`}>
            <div className="text-sm opacity-80">{p.name}</div>
            <div className="text-lg font-semibold">{p.balance === 0 ? "Sin saldo" : p.balance > 0 ? `Te debe ${formatMoney(p.balance)}` : `Le debés ${formatMoney(-p.balance)}`}</div>
            <div className="text-xs opacity-70">Devengado {formatMoney(p.accrued)} · Pagado {formatMoney(p.paid)}{p.upcoming !== 0 && ` · Próximas ${formatMoney(p.upcoming)}`}</div>
          </button>
        ))}
      </section>
      {current && <Detail key={current.personId} id={current.personId} />}
    </main>
  );
}
