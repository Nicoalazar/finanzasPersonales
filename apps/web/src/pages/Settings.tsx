import { useState, type FormEvent } from "react";
import { formatMoney } from "../lib/format";
import { useAccounts, useCategories, useCreateAccount, useCreateCategory, useDeleteCategory } from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "field";

export function Settings() {
  const accounts = useAccounts().data ?? [];
  const categories = useCategories().data ?? [];
  const createAccount = useCreateAccount();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [acc, setAcc] = useState({ name: "", kind: "BANK", initialBalance: "0" });
  const [cat, setCat] = useState({ name: "", type: "EXPENSE" });
  const [error, setError] = useState("");

  const run = (fn: () => Promise<unknown>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <main className="grid gap-6 md:grid-cols-2">
      {error && <p role="alert" className="col-span-full rounded bg-neg-soft p-2 text-sm text-neg">{error}</p>}
      <section className="min-w-0 space-y-3">
        <h2 className="font-semibold">Cuentas</h2>
        <ul className="card divide-y">
          {accounts.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 px-4 py-2 text-sm"><span className="truncate">{a.name}</span><span className="shrink-0 tabular-nums text-muted">{formatMoney(a.balance)}</span></li>
          ))}
          {accounts.length === 0 && <li className="p-4 text-sm text-muted">Todavía no hay cuentas.</li>}
        </ul>
        <form className="flex flex-wrap gap-2" onSubmit={run(async () => { await createAccount.mutateAsync({ ...acc, initialBalance: Number(acc.initialBalance.replace(",", ".")) || 0 }); setAcc({ ...acc, name: "" }); })}>
          <input className={`${field} w-full sm:w-auto sm:flex-1`} placeholder="Nombre (ej. Brubank)" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} required />
          <select className={`${field} flex-1 sm:flex-none`} value={acc.kind} onChange={(e) => setAcc({ ...acc, kind: e.target.value })}>
            <option value="BANK">Banco</option><option value="WALLET">Billetera</option><option value="CASH">Efectivo</option><option value="INVESTMENT">Inversión</option>
          </select>
          <NumberInput className={`${field} w-28 flex-1 sm:flex-none`} placeholder="Saldo inicial" aria-label="Saldo inicial" value={acc.initialBalance} onChange={(v) => setAcc({ ...acc, initialBalance: v })} />
          <button className="btn-primary">Agregar</button>
        </form>
      </section>

      <section className="min-w-0 space-y-3">
        <h2 className="font-semibold">Categorías</h2>
        {(["EXPENSE", "INCOME"] as const).map((type) => (
          <div key={type}>
            <h3 className="mb-1 text-xs uppercase text-muted">{type === "EXPENSE" ? "Gastos" : "Ingresos"}</h3>
            <div className="flex flex-wrap gap-1.5">
              {categories.filter((c) => c.type === type).map((c) => (
                <span key={c.id} className="btn-soft rounded-full py-1">
                  {c.name}
                  <button className="text-faint hover:text-neg" aria-label={`Eliminar ${c.name}`} onClick={run(() => deleteCategory.mutateAsync(c.id))}>×</button>
                </span>
              ))}
            </div>
          </div>
        ))}
        <form className="flex gap-2" onSubmit={run(async () => { await createCategory.mutateAsync(cat); setCat({ ...cat, name: "" }); })}>
          <input className={`${field} flex-1`} placeholder="Nueva categoría" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} required />
          <select className={field} value={cat.type} onChange={(e) => setCat({ ...cat, type: e.target.value })}>
            <option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option>
          </select>
          <button className="btn-primary">Agregar</button>
        </form>
      </section>
    </main>
  );
}
