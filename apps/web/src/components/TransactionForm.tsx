import { useState, type FormEvent } from "react";
import type { TransactionInput } from "@finanzas/shared";
import { useAccounts, useCategories, useCreateTransaction } from "../lib/queries";
import { today } from "../lib/format";
import { NumberInput } from "./NumberInput";

const field = "field w-full";

export function TransactionForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const categories = useCategories().data ?? [];
  const create = useCreateTransaction();
  const [type, setType] = useState<TransactionInput["type"]>("EXPENSE");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await create.mutateAsync({
        type, date, description, status: pending ? "PENDING" : "PAID",
        amount: Number(amount.replace(",", ".")),
        accountId: accountId || accounts[0]?.id,
        categoryId: type === "TRANSFER" ? null : categoryId || null,
        toAccountId: type === "TRANSFER" ? toAccountId : null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  if (accounts.length === 0) return <p className="rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn-ink">Primero creá una cuenta en Configuración.</p>;

  return (
    <form onSubmit={submit} className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      <div className="col-span-2 flex gap-1 sm:col-span-4">
        {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((t) => (
          <button key={t} type="button" onClick={() => { setType(t); setCategoryId(""); }}
            className={`${type === t ? "seg-on" : "seg-off"} py-1`}>
            {{ EXPENSE: "Gasto", INCOME: "Ingreso", TRANSFER: "Transferencia" }[t]}
          </button>
        ))}
      </div>
      <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <NumberInput className={field} placeholder="Monto" value={amount} onChange={setAmount} required />
      <select className={field} value={accountId || accounts[0]?.id} onChange={(e) => setAccountId(e.target.value)}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {type === "TRANSFER" ? (
        <select className={field} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
          <option value="">Cuenta destino</option>
          {accounts.filter((a) => a.id !== (accountId || accounts[0]?.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      ) : (
        <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sin categoría</option>
          {categories.filter((c) => c.type === type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <input className={`${field} col-span-2 sm:col-span-3`} placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Pendiente</label>
      {error && <p role="alert" className="col-span-2 text-sm text-neg sm:col-span-4">{error}</p>}
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button className="btn-primary px-4" disabled={create.isPending}>{create.isPending ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="text-sm text-muted" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}
