import { useState, type FormEvent } from "react";
import { splitInstallments } from "@finanzas/shared";
import type { CardDto } from "@finanzas/shared";
import { formatMoney, monthLabel, today } from "../lib/format";
import { useCategories, useCreatePerson, useCreatePurchase, useFirstMonth, usePersons } from "../lib/queries";
import { NumberInput } from "./NumberInput";

const field = "w-full rounded border bg-white px-2 py-1.5 text-sm";
interface ShareRow { personId: string; mode: "PERCENT" | "AMOUNT"; value: string }

export function PurchaseForm({ card, onDone }: { card: CardDto; onDone: () => void }) {
  const categories = (useCategories().data ?? []).filter((c) => c.type === "EXPENSE");
  const persons = usePersons().data ?? [];
  const createPerson = useCreatePerson();
  const create = useCreatePurchase();
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [newPerson, setNewPerson] = useState("");
  const [error, setError] = useState("");

  const total = Number(amount.replace(",", ".")) || 0;
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  const first = useFirstMonth(card.id, date).data?.month;
  const cuota = total > 0 ? splitInstallments(total, n)[0]! / 100 : 0;

  const setShare = (i: number, patch: Partial<ShareRow>) => setShares(shares.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await create.mutateAsync({
        cardId: card.id, date, description, totalAmount: total, installmentCount: n, categoryId: categoryId || null,
        shares: shares.filter((s) => s.personId).map((s) => ({ personId: s.personId, mode: s.mode, value: Number(s.value.replace(",", ".")) })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  const addPerson = async () => {
    if (!newPerson.trim()) return;
    try {
      const p = await createPerson.mutateAsync(newPerson.trim());
      setShares([...shares, { personId: p.id, mode: "PERCENT", value: "100" }]);
      setNewPerson("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow sm:grid-cols-4">
      <input className={`${field} col-span-2`} placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} required />
      <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Sin categoría</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <NumberInput className={field} placeholder="Monto total" value={amount} onChange={setAmount} required />
      <input className={field} type="number" min={1} max={60} value={count} onChange={(e) => setCount(e.target.value)} aria-label="Cuotas" />
      <p className="col-span-2 self-center text-xs text-slate-500">
        {n} cuota{n > 1 ? "s" : ""} de {formatMoney(cuota)} · primera en el resumen de {first ? monthLabel(first) : "…"}
      </p>

      <div className="col-span-2 space-y-2 sm:col-span-4">
        <div className="text-xs font-medium text-slate-500">Parte de terceros (opcional)</div>
        {shares.map((s, i) => (
          <div key={i} className="flex gap-2">
            <select className={field} value={s.personId} onChange={(e) => setShare(i, { personId: e.target.value })} required>
              <option value="">Persona</option>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={`${field} w-32`} value={s.mode} onChange={(e) => setShare(i, { mode: e.target.value as ShareRow["mode"] })}>
              <option value="PERCENT">% de la cuota</option><option value="AMOUNT">$ por cuota</option>
            </select>
            <NumberInput className={`${field} w-28`} value={s.value} onChange={(v) => setShare(i, { value: v })} required />
            <button type="button" className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar" onClick={() => setShares(shares.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={() => setShares([...shares, { personId: "", mode: "PERCENT", value: "50" }])}>+ Persona</button>
          <input className={`${field} w-40`} placeholder="Nueva persona" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
          <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={addPerson}>Crear</button>
        </div>
      </div>

      {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-4">{error}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white" disabled={create.isPending}>Guardar compra</button>
        <button type="button" className="text-sm text-slate-500" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}
