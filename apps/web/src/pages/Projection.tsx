import { useEffect, useState } from "react";
import type { ProjectionCategoryDto, ProjectionDto } from "@finanzas/shared";
import { StatRow } from "../components/Stats";
import { NumberInput } from "../components/NumberInput";
import { monthLabel, monthShort } from "../lib/format";
import { useDeleteEstimate, useProjection, useSetEstimate, useSetInflation } from "../lib/queries";

const parseNum = (s: string) => Number(s.replace(",", "."));
const pctFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
/** Montos proyectados: sin centavos (son estimaciones). */
const money0 = (n: number) => whole.format(Math.round(n));
const listMonths = (ms: string[]) => ms.map((m) => monthShort(m, true)).join(", ");

function Inflation({ value, onError }: { value: number; onError: (m: string) => void }) {
  const set = useSetInflation();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const save = async () => {
    const n = text.trim() === "" ? 0 : parseNum(text);
    if (!Number.isFinite(n) || n < 0 || n > 100) return onError("La inflación va de 0 a 100 % mensual");
    if (n !== value) await set.mutateAsync({ inflationPct: n }).catch((e) => onError(e instanceof Error ? e.message : "Error"));
  };
  return (
    <label className="flex items-center gap-1.5 text-sm">
      Inflación mensual
      <NumberInput className="field w-16 text-right" value={text} onChange={setText} onBlur={save} aria-label="Inflación mensual en porcentaje"
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />%
    </label>
  );
}

function CategoryRow({ c, onError }: { c: ProjectionCategoryDto; onError: (m: string) => void }) {
  const set = useSetEstimate();
  const del = useDeleteEstimate();
  const [text, setText] = useState(c.estimate == null ? "" : String(c.estimate));
  useEffect(() => setText(c.estimate == null ? "" : String(c.estimate)), [c.estimate]);
  const save = async () => {
    if (!c.categoryId) return;
    try {
      if (text.trim() === "") { if (c.estimate != null) await del.mutateAsync(c.categoryId); return; }
      const n = parseNum(text);
      if (!Number.isFinite(n) || n < 0) return onError("Ingresá un monto válido");
      if (n !== c.estimate) await set.mutateAsync({ categoryId: c.categoryId, amount: n });
    } catch (e) { onError(e instanceof Error ? e.message : "Error"); }
  };
  const ratio = c.base > 0 ? c.current / c.base : c.current > 0 ? 1.01 : 0;
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-2">{c.name}</td>
      <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted sm:table-cell">{money0(c.average)}</td>
      <td className="px-2 py-1.5 text-right">
        {c.categoryId ? (
          <NumberInput className="field w-28 text-right" placeholder={money0(c.average)} value={text} onChange={setText} onBlur={save}
            aria-label={`Monto propio de ${c.name}`} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        ) : <span className="text-xs text-faint">—</span>}
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums">
        <span className={ratio > 1 ? "text-neg" : ""}>{money0(c.current)}</span>
        <div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className={`h-full ${ratio > 1 ? "bg-neg" : "bg-accent"}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
        </div>
      </td>
    </tr>
  );
}

type Month = ProjectionDto["months"][number];

function MonthsTable({ p }: { p: ProjectionDto }) {
  const th = "whitespace-nowrap px-1.5 py-1.5 text-right font-normal";
  const strong = `${th} font-medium text-ink`;
  const cell = "whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums";
  const all: [string, (m: Month) => number][] = [
    ["Recurrentes", (m) => m.recurring], ["Tarjetas", (m) => m.cards], ["Deudas", (m) => m.debts], ["Variable", (m) => m.variable],
  ];
  const detail = all.filter(([, f]) => p.months.some((m) => f(m) !== 0)); // sin columnas vacías

  return (
    <>
      {/* celular: lo esencial por mes */}
      <ul className="divide-y text-sm sm:hidden">
        {p.months.map((m, i) => (
          <li key={m.month} className="flex items-start justify-between gap-3 py-2">
            <div>
              <div>{monthShort(m.month, true)}{i === 0 && <span className="ml-1 text-xs text-muted">en curso</span>}</div>
              <div className="text-[11px] text-muted">
                {money0(m.income)}{m.sac > 0 && " (aguinaldo)"} − {money0(m.expense)}
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className={`font-medium ${m.balance < 0 ? "text-neg" : "text-pos"}`}>{money0(m.balance)}</div>
              <div className={`text-[11px] ${m.cumulative < 0 ? "text-neg" : "text-muted"}`}>acum. {money0(m.cumulative)}</div>
            </div>
          </li>
        ))}
      </ul>
    <div className="-mx-4 hidden overflow-x-auto px-4 sm:block">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="sticky left-0 bg-surface py-1.5 pr-2 text-left font-normal">Mes</th>
            <th className={strong}>Ingresos</th>
            {detail.map(([l]) => <th key={l} className={th}>{l}</th>)}
            <th className={strong}>Gastos</th><th className={strong}>Resultado</th><th className={strong}>Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {p.months.map((m, i) => (
            <tr key={m.month} className="border-t">
              <td className="sticky left-0 whitespace-nowrap bg-surface py-1.5 pr-2">
                {monthShort(m.month, true)}{i === 0 && <span className="ml-1 text-xs text-muted">en curso</span>}
              </td>
              <td className={cell}>
                {money0(m.income)}
                {m.sac > 0 && <div className="text-[11px] text-muted">incl. aguinaldo {money0(m.sac)}</div>}
              </td>
              {detail.map(([l, f]) => <td key={l} className={`${cell} text-muted`}>{f(m) ? money0(f(m)) : "—"}</td>)}
              <td className={cell}>{money0(m.expense)}</td>
              <td className={`${cell} font-medium ${m.balance < 0 ? "text-neg" : "text-pos"}`}>{money0(m.balance)}</td>
              <td className={`${cell} ${m.cumulative < 0 ? "text-neg" : ""}`}>{money0(m.cumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function Projection() {
  const [months, setMonths] = useState(12);
  const [error, setError] = useState("");
  const { data: p, isLoading } = useProjection(months);

  if (isLoading || !p) return <main className="text-sm text-muted">Cargando…</main>;

  const last = p.months[p.months.length - 1]!;
  const worst = p.months.reduce((a, m) => (m.balance < a.balance ? m : a), p.months[0]!);
  const red = p.months.filter((m) => m.balance < 0).length;
  const variableTotal = p.categories.reduce((a, c) => a + c.base, 0);
  const currentTotal = p.categories.reduce((a, c) => a + c.current, 0);
  const noSalary = p.jobs.length === 0;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Proyección</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Inflation value={p.inflationPct} onError={setError} />
          <select className="rounded border bg-surface px-2 py-1.5 text-sm" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Meses a proyectar">
            {[6, 12, 24].map((m) => <option key={m} value={m}>Próximos {m} meses</option>)}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="rounded bg-neg-soft p-2 text-sm text-neg">{error}</p>}
      {noSalary && (
        <p className="rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn-ink">
          No hay recibos de sueldo cargados: la proyección no tiene ingresos. Cargá al menos un recibo en Sueldos.
        </p>
      )}

      <StatRow items={[
        { label: `Acumulado a ${monthLabel(last.month).toLowerCase()}`, value: money0(last.cumulative), cls: last.cumulative < 0 ? "text-neg" : "text-pos" },
        { label: "Peor mes", value: money0(worst.balance), sub: monthLabel(worst.month), cls: worst.balance < 0 ? "text-neg" : "text-ink" },
        { label: "Meses en rojo", value: `${red} de ${p.months.length}`, cls: red > 0 ? "text-neg" : "text-ink" },
      ]} />

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Mes a mes</h2>
        <MonthsTable p={p} />
      </section>

      <section className="card space-y-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Gasto variable por mes <span className="text-xs font-normal text-muted">· a precios de hoy</span></h2>
          <span className="text-sm">Se proyectan <b className="tabular-nums">{money0(variableTotal)}</b> por mes</span>
        </div>
        <p className="text-xs text-muted">
          {p.partial
            ? <>Todavía no hay meses completos con gastos: el promedio usa lo que va de {monthLabel(p.from).toLowerCase()} (mes en curso), así que <b className="text-warn-ink">subestima</b> el gasto. Cargá un monto propio en las categorías que conozcas.</>
            : <>Promedio de {listMonths(p.baseMonths)}. Es lo que no es recurrente ni cuota ya comprometida: movimientos sueltos, compras nuevas con tarjeta (1.ª cuota) y tu parte de los compartidos. Un monto propio reemplaza al promedio; vacío, vuelve al promedio.</>}
        </p>
        {p.categories.length === 0 ? <p className="text-sm text-muted">Sin gasto variable registrado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-normal">Categoría</th>
                  <th className="hidden px-2 py-1.5 text-right font-normal sm:table-cell">Promedio</th>
                  <th className="px-2 py-1.5 text-right font-normal">Monto propio<span className="font-normal sm:hidden"> (vacío = promedio)</span></th>
                  <th className="py-1.5 pl-2 text-right font-normal">{monthShort(p.from, true)} real</th>
                </tr>
              </thead>
              <tbody>
                {p.categories.map((c) => <CategoryRow key={c.categoryId ?? "none"} c={c} onError={setError} />)}
                <tr className="border-t font-medium">
                  <td className="py-1.5 pr-2">Total</td>
                  <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted sm:table-cell">{money0(p.categories.reduce((a, c) => a + c.average, 0))}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money0(variableTotal)}</td>
                  <td className={`py-1.5 pl-2 text-right tabular-nums ${currentTotal > variableTotal ? "text-neg" : ""}`}>{money0(currentTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-1.5 p-4 text-xs text-muted">
        <h2 className="text-sm font-semibold text-ink">Cómo se calcula</h2>
        <p><b>Sueldo:</b> el recibo real si ya está cargado; si no, el último neto de cada trabajo activo, sin ajuste
          {p.jobs.length > 0 && <> ({p.jobs.map((j) => `${j.name} ${money0(j.net)}`).join(" · ")})</>}. <b>Aguinaldo</b> en junio y diciembre: la mitad del mayor neto del semestre (solo trabajos registrados).</p>
        <p><b>Recurrentes:</b> tu parte de cada uno (lo que te devuelve otra persona no cuenta). <b>Tarjetas:</b> tu neto de los resúmenes que vencen en el mes, solo con las cuotas ya compradas. <b>Deudas:</b> cuotas de lo que le debés a otras personas.</p>
        <p><b>Inflación ({pctFmt.format(p.inflationPct)} % mensual):</b> sube los recurrentes (desde su último precio cargado) y el gasto variable; no toca el sueldo ni las cuotas de tarjeta.</p>
        <p>Los reintegros no se proyectan porque los gastos ya son solo tu parte. Otros ingresos que no sean sueldo tampoco.</p>
      </section>
    </main>
  );
}
