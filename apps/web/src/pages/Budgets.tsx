import { useEffect, useState } from "react";
import type { BudgetRowDto } from "@finanzas/shared";
import { MonthNav } from "../components/MonthNav";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import { useBudgets, useCopyBudgets, useDeleteBudget, useSetBudget } from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "field";
const parseNum = (s: string) => Number(s.replace(",", "."));
const BAR = { NONE: "bg-line-strong", OK: "bg-pos", WARN: "bg-warn", OVER: "bg-neg" } as const;
const LABEL = { NONE: "", OK: "", WARN: "Cerca del límite", OVER: "Superado" } as const;

function Progress({ pct, status }: { pct: number | null; status: BudgetRowDto["status"] }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${BAR[status]}`} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
    </div>
  );
}

function Row({ row, month, onError }: { row: BudgetRowDto; month: string; onError: (m: string) => void }) {
  const set = useSetBudget();
  const del = useDeleteBudget();
  const [value, setValue] = useState(row.budget == null ? "" : String(row.budget));
  useEffect(() => setValue(row.budget == null ? "" : String(row.budget)), [row.budget, month]);

  const save = async () => {
    if (!row.categoryId) return;
    const text = value.trim();
    try {
      if (text === "") { if (row.budget != null) await del.mutateAsync({ categoryId: row.categoryId, month }); return; }
      const n = parseNum(text);
      if (!Number.isFinite(n) || n < 0) return onError("Ingresá un monto válido");
      if (n !== row.budget) await set.mutateAsync({ categoryId: row.categoryId, month, amount: n });
    } catch (e) { onError(e instanceof Error ? e.message : "Error"); }
  };

  return (
    <div className="card space-y-1.5 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-28 flex-1 font-medium">{row.name}</span>
        {row.status !== "NONE" && LABEL[row.status] && (
          <span className={`tag rounded-full ${row.status === "OVER" ? "bg-neg-soft text-neg-ink" : "bg-warn-soft text-warn-ink"}`}>{LABEL[row.status]}</span>
        )}
        {row.categoryId && (
          <NumberInput className={`${field} w-28 text-right`} placeholder="Sin límite" value={value} aria-label={`Presupuesto de ${row.name}`}
            onChange={setValue} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        )}
      </div>
      {row.budget != null && <Progress pct={row.pct} status={row.status} />}
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span>Gastado {formatMoney(row.spent)}{row.pct != null && ` · ${row.pct.toLocaleString("es-AR")}%`}</span>
        {row.remaining != null && (
          <span className={row.remaining < 0 ? "text-neg" : ""}>{row.remaining < 0 ? `Te pasaste ${formatMoney(-row.remaining)}` : `Quedan ${formatMoney(row.remaining)}`}</span>
        )}
      </div>
    </div>
  );
}

export function Budgets() {
  const [month, setMonth] = useState(currentMonth());
  const [pct, setPct] = useState("5");
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { data } = useBudgets(month);
  const copy = useCopyBudgets();
  const prev = shiftMonth(month, -1);

  const rows = [...(data?.rows ?? [])].sort((a, b) => {
    const rank = (r: BudgetRowDto) => (r.budget != null ? 0 : r.spent > 0 ? 1 : 2);
    return rank(a) - rank(b) || (b.pct ?? 0) - (a.pct ?? 0) || b.spent - a.spent || a.name.localeCompare(b.name);
  });
  const t = data?.totals;

  const doCopy = async () => {
    setError(""); setNotice("");
    try {
      const r = await copy.mutateAsync({ fromMonth: prev, toMonth: month, increasePercent: parseNum(pct) || 0, overwrite });
      setNotice(r.copied === 0 && r.skipped === 0 ? `${monthLabel(prev)} no tiene presupuestos para copiar.` : `Se copiaron ${r.copied}${r.skipped ? ` (${r.skipped} ya tenían valor)` : ""}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  return (
    <main className="space-y-4">
      <MonthNav month={month} onChange={setMonth} />

      {t && t.budget > 0 && (
        <section className="card space-y-2 p-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>Presupuestado <b>{formatMoney(t.budget)}</b></span>
            <span>Gastado en esas categorías <b>{formatMoney(t.spentInBudgeted)}</b>{t.pct != null && ` (${t.pct.toLocaleString("es-AR")}%)`}</span>
          </div>
          <Progress pct={t.pct} status={t.status} />
          {(t.over > 0 || t.warn > 0) && (
            <p className="text-xs text-muted">{t.over > 0 && <b className="text-neg">{t.over} superada{t.over > 1 ? "s" : ""}</b>}{t.over > 0 && t.warn > 0 && " · "}{t.warn > 0 && <b className="text-warn">{t.warn} cerca del límite</b>}</p>
          )}
          <p className="text-xs text-muted">Gasto total del mes (incluye lo que no tiene presupuesto): {formatMoney(t.spentTotal)}</p>
        </section>
      )}

      <section className="card flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <span>Copiar de {monthLabel(prev)} con</span>
        <label className="flex items-center gap-1">+<NumberInput className={`${field} w-16`} value={pct} onChange={setPct} aria-label="Aumento en porcentaje" />%</label>
        <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Reemplazar los ya cargados</label>
        <button className="btn-primary" onClick={doCopy} disabled={copy.isPending}>{copy.isPending ? "Copiando…" : "Copiar"}</button>
        {notice && <span className="text-xs text-pos">{notice}</span>}
      </section>

      {error && <p role="alert" className="rounded bg-neg-soft p-2 text-sm text-neg">{error}</p>}
      {rows.length === 0 && <p className="rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn-ink">Creá categorías de gastos en Configuración para poder presupuestarlas.</p>}
      <div className="space-y-2">
        {rows.map((r) => <Row key={r.categoryId ?? "none"} row={r} month={month} onError={setError} />)}
      </div>
    </main>
  );
}
