import { useEffect, useState, type FormEvent } from "react";
import type { RecurringDto, SharedGroupDto } from "@finanzas/shared";
import { MonthNav } from "../components/MonthNav";
import { iconBtnDanger } from "../components/Stats";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import {
  useAccounts, useCategories, useClearGroupPercent, useCreateGroup, useCreateRecurring, useDeleteRecurring, usePatchRecurring,
  usePersons, useRecurring, useSetGroupPercent, useSetPrice, useSharedGroups,
} from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;
const FREQ = { MONTHLY: "Mensual", BIMONTHLY: "Bimestral", YEARLY: "Anual" } as const;

function useGuard() {
  const [error, setError] = useState("");
  const guard = (fn: () => Promise<unknown>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };
  return { error, guard };
}

function GroupCard({ group, month }: { group: SharedGroupDto; month: string }) {
  const set = useSetGroupPercent();
  const clear = useClearGroupPercent();
  const { error, guard } = useGuard();
  const [value, setValue] = useState(String(group.percent));
  useEffect(() => setValue(String(group.percent)), [group.percent, month]);
  const save = () => parseNum(value) !== group.percent && guard(() => set.mutateAsync({ id: group.id, month, percent: parseNum(value) }))();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow">
      <div className="min-w-32 flex-1">
        <div className="font-medium">{group.name}</div>
        <div className="text-xs text-slate-500">
          {group.percentIsOwn ? `Valor propio de ${monthLabel(month)}` : `Heredado (último valor cargado o base ${group.myPercent}%)`}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        Mi parte en {monthLabel(month)}
        <NumberInput className={`${field} w-20 text-right`} value={value} aria-label={`Porcentaje de ${group.name}`}
          onChange={setValue} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        %
      </label>
      {group.percentIsOwn && (
        <button className="text-xs text-slate-500 underline" onClick={guard(() => clear.mutateAsync({ id: group.id, month }))}>Quitar valor de este mes</button>
      )}
      {error && <span className="w-full text-sm text-red-600">{error}</span>}
    </div>
  );
}

function RecurringRow({ r, month, groups }: { r: RecurringDto; month: string; groups: SharedGroupDto[] }) {
  const accounts = useAccounts().data ?? [];
  const persons = usePersons().data ?? [];
  const setPrice = useSetPrice();
  const patch = usePatchRecurring();
  const del = useDeleteRecurring();
  const { error, guard } = useGuard();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("");
  const group = groups.find((g) => g.id === r.sharedGroupId);
  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? "?";

  const applyPct = () => {
    const n = parseNum(pct);
    if (n) setAmount(String(Math.round(r.price * (1 + n / 100) * 100) / 100));
  };

  return (
    <div className={`rounded-xl bg-white p-4 shadow ${r.occursThisMonth ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-32 flex-1">
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-slate-500">
            {FREQ[r.frequency]} · desde {monthLabel(r.startMonth)}{r.endMonth && ` hasta ${monthLabel(r.endMonth)}`}
            {r.shares.map((s) => ` · ${personName(s.personId)} ${s.value}${s.mode === "PERCENT" ? "%" : " $"}`).join("")}
          </div>
          <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            Cuenta
            <select className="rounded border bg-white px-1 py-0.5 text-xs" value={r.accountId ?? ""} aria-label={`Cuenta de ${r.name}`} disabled={patch.isPending}
              onChange={(e) => e.target.value && guard(() => patch.mutateAsync({ id: r.id, patch: { accountId: e.target.value } }))()}>
              {!r.accountId && <option value="">Sin cuenta</option>}
              {accounts.filter((a) => !a.archived || a.id === r.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (archivada)" : ""}</option>)}
            </select>
          </label>
        </div>
        <div className="text-right text-sm">
          {r.occursThisMonth ? (
            <>
              <div className="font-semibold">{formatMoney(r.myAmount)}</div>
              {group && <div className="text-xs text-slate-500">{r.groupPercent}% de {formatMoney(r.price)}</div>}
            </>
          ) : <span className="text-xs text-slate-500">No corresponde este mes</span>}
        </div>
        <button className="rounded bg-slate-100 px-2 py-1 text-xs" onClick={() => { setEditing(!editing); setAmount(String(r.price)); setPct(""); }}>Cambiar precio</button>
        {!r.endMonth && <button className="rounded bg-slate-100 px-2 py-1 text-xs" title={`Termina en ${monthLabel(shiftMonth(month, -1))}`}
          onClick={() => confirm(`¿Finalizar "${r.name}"? Deja de generarse desde ${monthLabel(month)}.`) && guard(() => patch.mutateAsync({ id: r.id, patch: { endMonth: shiftMonth(month, -1) } }))()}>Finalizar</button>}
        <button className={iconBtnDanger} aria-label="Eliminar"
          onClick={() => confirm(`¿Eliminar "${r.name}"? Se borran sus pendientes; lo pagado se conserva.`) && guard(() => del.mutateAsync(r.id))()}>✕</button>
      </div>
      {editing && (
        <form className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm"
          onSubmit={guard(async () => { await setPrice.mutateAsync({ id: r.id, fromMonth: month, amount: parseNum(amount) }); setEditing(false); })}>
          <span className="text-slate-500">Nuevo precio desde {monthLabel(month)}:</span>
          <NumberInput className={`${field} w-32`} value={amount} onChange={setAmount} required />
          <span className="text-slate-400">o aumento</span>
          <NumberInput className={`${field} w-16`} placeholder="10" value={pct} onChange={setPct} onBlur={applyPct} />
          <span className="text-slate-500">%</span>
          <button className="rounded bg-slate-900 px-3 py-1.5 text-white">Guardar</button>
        </form>
      )}
      {r.prices.length > 1 && (
        <div className="mt-2 text-xs text-slate-500">Historial: {r.prices.map((p) => `${p.fromMonth} ${formatMoney(p.amount)}`).join(" → ")}</div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

interface ShareRow { personId: string; mode: "PERCENT" | "AMOUNT"; value: string }

function NewRecurringForm({ month, groups, onDone }: { month: string; groups: SharedGroupDto[]; onDone: () => void }) {
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const categories = (useCategories().data ?? []).filter((c) => c.type === "EXPENSE");
  const persons = usePersons().data ?? [];
  const create = useCreateRecurring();
  const { error, guard } = useGuard();
  const [f, setF] = useState({ name: "", amount: "", frequency: "MONTHLY", dayOfMonth: "1", startMonth: month, accountId: "", categoryId: "", sharedGroupId: "" });
  const [shares, setShares] = useState<ShareRow[]>([]);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const setShare = (i: number, patch: Partial<ShareRow>) => setShares(shares.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  if (accounts.length === 0) return <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Primero creá una cuenta en Configuración.</p>;
  return (
    <form className="grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow sm:grid-cols-4"
      onSubmit={guard(async () => {
        await create.mutateAsync({
          name: f.name, amount: parseNum(f.amount), frequency: f.frequency, dayOfMonth: Number(f.dayOfMonth) || 1, startMonth: f.startMonth,
          accountId: f.accountId || accounts[0]!.id, categoryId: f.categoryId || null, sharedGroupId: f.sharedGroupId || null,
          shares: shares.filter((s) => s.personId).map((s) => ({ personId: s.personId, mode: s.mode, value: parseNum(s.value) })),
        });
        onDone();
      })}>
      <input className={`${field} col-span-2`} placeholder="Nombre (ej. Alquiler)" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
      <NumberInput className={field} placeholder="Precio total" value={f.amount} onChange={(v) => set({ amount: v })} required />
      <select className={field} value={f.frequency} onChange={(e) => set({ frequency: e.target.value })}>
        {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label className="text-xs text-slate-500">Empieza <input className={`${field} w-full`} type="month" value={f.startMonth} onChange={(e) => set({ startMonth: e.target.value })} required /></label>
      <label className="text-xs text-slate-500">Día del mes <input className={`${field} w-full`} type="number" min={1} max={31} value={f.dayOfMonth} onChange={(e) => set({ dayOfMonth: e.target.value })} /></label>
      <select className={field} value={f.accountId || accounts[0]!.id} onChange={(e) => set({ accountId: e.target.value })} aria-label="Cuenta">
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className={field} value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} aria-label="Categoría">
        <option value="">Sin categoría</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select className={`${field} col-span-2`} value={f.sharedGroupId} onChange={(e) => set({ sharedGroupId: e.target.value })} aria-label="Grupo compartido">
        <option value="">Pago el total</option>
        {groups.map((g) => <option key={g.id} value={g.id}>Compartido: {g.name} (pago solo mi %)</option>)}
      </select>
      <div className="col-span-2 space-y-2 sm:col-span-4">
        <div className="text-xs font-medium text-slate-500">Parte de terceros sobre lo que me toca pagar (opcional)</div>
        {shares.map((s, i) => (
          <div key={i} className="flex gap-2">
            <select className={`${field} flex-1`} value={s.personId} onChange={(e) => setShare(i, { personId: e.target.value })} required>
              <option value="">Persona</option>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={`${field} w-32`} value={s.mode} onChange={(e) => setShare(i, { mode: e.target.value as ShareRow["mode"] })}>
              <option value="PERCENT">% del monto</option><option value="AMOUNT">$ por mes</option>
            </select>
            <NumberInput className={`${field} w-24`} value={s.value} onChange={(v) => setShare(i, { value: v })} required />
            <button type="button" className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar" onClick={() => setShares(shares.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={() => setShares([...shares, { personId: "", mode: "PERCENT", value: "50" }])}>+ Persona</button>
        {persons.length === 0 && <span className="ml-2 text-xs text-slate-500">Las personas se crean al cargar una compra con tarjeta.</span>}
      </div>
      {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-4">{error}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white">Guardar</button>
        <button type="button" className="text-sm text-slate-500" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

export function Recurring() {
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", percent: "35" });
  const recurring = useRecurring(month).data ?? [];
  const groups = useSharedGroups(month).data ?? [];
  const createGroup = useCreateGroup();
  const { error, guard } = useGuard();
  const total = recurring.filter((r) => r.occursThisMonth).reduce((a, r) => a + r.myAmount, 0);

  return (
    <main className="space-y-5">
      <MonthNav month={month} onChange={setMonth}>
        {!adding && <button className="rounded bg-slate-900 px-3 py-1.5 text-white" onClick={() => setAdding(true)}>+ Recurrente</button>}
      </MonthNav>
      {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Grupos compartidos</h2>
        {groups.map((g) => <GroupCard key={g.id} group={g} month={month} />)}
        <form className="flex flex-wrap items-center gap-2 [&>input]:flex-1" onSubmit={guard(async () => { await createGroup.mutateAsync({ name: newGroup.name, myPercent: parseNum(newGroup.percent) }); setNewGroup({ ...newGroup, name: "" }); })}>
          <input className={field} placeholder={groups.length ? "Otro grupo" : "Nuevo grupo (ej. Hogar)"} value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} required />
          <label className="text-xs text-slate-500">% base <NumberInput className={`${field} w-16`} value={newGroup.percent} onChange={(v) => setNewGroup({ ...newGroup, percent: v })} /></label>
          <button className="rounded bg-white px-3 py-1.5 text-sm shadow">Crear grupo</button>
        </form>
      </section>

      {adding && <NewRecurringForm month={month} groups={groups} onDone={() => setAdding(false)} />}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Recurrentes</h2>
          {total > 0 && <span className="text-sm text-slate-600">Total del mes: <b>{formatMoney(total)}</b></span>}
        </div>
        {recurring.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow">Todavía no hay gastos recurrentes (alquiler, servicios, suscripciones).</p>}
        {recurring.map((r) => <RecurringRow key={r.id} r={r} month={month} groups={groups} />)}
      </section>
    </main>
  );
}
