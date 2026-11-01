import { useState } from "react";
import type { DashboardSeriesPoint } from "@finanzas/shared";
import { formatCompact, formatMoney, monthLabel, monthShort, niceMax } from "../lib/format";

const W = 640, H = 240;
const M = { l: 44, r: 16, t: 14, b: 28 };
const IW = W - M.l - M.r, IH = H - M.t - M.b;
const GAP = 2; // separación entre segmentos, del color de la superficie

export const STACK = [
  { key: "cards", label: "Tarjetas", color: "var(--series-1)" },
  { key: "recurring", label: "Recurrentes", color: "var(--series-2)" },
  { key: "other", label: "Otros", color: "var(--series-3)" },
] as const;

/** Rectángulo con las dos esquinas superiores redondeadas (final del dato); la base queda recta. */
const roundedTop = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
};

function xLabelEvery(n: number) { return n <= 12 ? 1 : n <= 24 ? 2 : 3; }

function Tooltip({ idx, n, children }: { idx: number; n: number; children: React.ReactNode }) {
  const pct = Math.min(Math.max(((M.l + (IW / n) * (idx + 0.5)) / W) * 100, 16), 84);
  return (
    <div role="tooltip" className="pointer-events-none absolute top-0 z-10 w-52 -translate-x-1/2 rounded-lg border bg-white p-2.5 text-xs shadow-lg" style={{ left: `${pct}%` }}>
      {children}
    </div>
  );
}

const yTicks = (max: number, min = 0) => Array.from({ length: 5 }, (_, i) => min + ((max - min) / 4) * i);

/** Gastos apilados por mes + línea de ingresos, en un único eje. */
export function StackedChart({ series }: { series: DashboardSeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  const max = niceMax(Math.max(...series.map((s) => Math.max(s.cards + s.recurring + s.other, s.income))));
  const y = (v: number) => M.t + IH - (v / max) * IH;
  const band = IW / n, barW = Math.min(24, band * 0.6);
  const cx = (i: number) => M.l + band * (i + 0.5);
  const every = xLabelEvery(n);
  const incomePts = series.map((s, i) => `${cx(i)},${y(s.income)}`).join(" ");
  const last = series[n - 1]!;
  const h = hover != null ? series[hover]! : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gastos por mes, apilados por origen, e ingresos">
        {yTicks(max).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">{formatCompact(t)}</text>
          </g>
        ))}
        {series.map((s, i) => {
          if (hover === i) return <rect key={`h${i}`} x={M.l + band * i} y={M.t} width={band} height={IH} fill="#f1f5f9" />;
          return null;
        })}
        {series.map((s, i) => {
          let top = y(0);
          const segs = STACK.map((st) => ({ ...st, v: s[st.key] })).filter((g) => g.v > 0);
          return (
            <g key={s.month}>
              {segs.map((g, k) => {
                const full = (g.v / max) * IH;
                const hgt = Math.max(full - (k < segs.length - 1 || segs.length > 1 ? GAP : 0), 1);
                const yy = top - full;
                top = yy;
                const x = cx(i) - barW / 2;
                return k === segs.length - 1
                  ? <path key={g.key} d={roundedTop(x, yy, barW, hgt, 4)} fill={g.color} />
                  : <rect key={g.key} x={x} y={yy + (full - hgt)} width={barW} height={hgt} fill={g.color} />;
              })}
              {i % every === 0 && <text x={cx(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">{monthShort(s.month, s.month.endsWith("-01") || i === 0)}</text>}
            </g>
          );
        })}
        <polyline points={incomePts} fill="none" stroke="var(--chart-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {last.income > 0 && (
          <>
            <circle cx={cx(n - 1)} cy={y(last.income)} r={4} fill="var(--chart-ink)" stroke="var(--chart-surface)" strokeWidth={2} />
            <text x={cx(n - 1) - 8} y={y(last.income) - 8} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--chart-ink)">{formatCompact(last.income)}</text>
          </>
        )}
        {series.map((s, i) => (
          <rect key={`hit${s.month}`} x={M.l + band * i} y={M.t} width={band} height={IH + M.b} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {h && hover != null && (
        <Tooltip idx={hover} n={n}>
          <div className="mb-1 font-semibold">{monthLabel(h.month)}</div>
          <Row color="var(--chart-ink)" label="Ingresos" value={h.income} line />
          {STACK.map((st) => <Row key={st.key} color={st.color} label={st.label} value={h[st.key]} />)}
          <div className="mt-1 flex justify-between border-t pt-1"><span>Reintegros</span><span>{formatMoney(h.reimbursements)}</span></div>
          <div className="flex justify-between font-medium"><span>Resultado</span><span>{formatMoney(h.balance)}</span></div>
        </Tooltip>
      )}
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Leyenda">
        {STACK.map((st) => <li key={st.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: st.color }} />{st.label}</li>)}
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "var(--chart-ink)" }} />Ingresos</li>
      </ul>
    </div>
  );
}

function Row({ color, label, value, line }: { color: string; label: string; value: number; line?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <span className={line ? "h-0.5 w-3 rounded" : "h-2 w-2 rounded-sm"} style={{ background: color }} />{label}
      </span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

/** Resultado acumulado: una sola serie, con cruz y punto al pasar el mouse. */
export function CumulativeChart({ series }: { series: DashboardSeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  const vals = series.map((s) => s.cumulativeBalance);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = niceMax(hi - lo || 1);
  const min = lo < 0 ? -Math.ceil(-lo / (span / 4)) * (span / 4) : 0;
  const max = Math.max(min + span, hi);
  const y = (v: number) => M.t + IH - ((v - min) / (max - min)) * IH;
  const step = IW / Math.max(n - 1, 1);
  const x = (i: number) => M.l + step * i;
  const every = xLabelEvery(n);
  const pts = series.map((s, i) => `${x(i)},${y(s.cumulativeBalance)}`).join(" ");
  const lastI = n - 1;
  const h = hover != null ? series[hover]! : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Resultado acumulado por mes">
        {yTicks(max, min).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={Math.abs(t) < 1e-9 ? "#94a3b8" : "var(--chart-grid)"} strokeWidth={1} />
            <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">{formatCompact(t)}</text>
          </g>
        ))}
        {series.map((s, i) => i % every === 0 && <text key={s.month} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">{monthShort(s.month, s.month.endsWith("-01") || i === 0)}</text>)}
        <polyline points={pts} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + IH} stroke="#94a3b8" strokeWidth={1} />}
        {(() => {
          const i = hover ?? lastI;
          return <circle cx={x(i)} cy={y(series[i]!.cumulativeBalance)} r={4} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />;
        })()}
        {hover == null && (
          <text x={x(lastI) - 8} y={y(series[lastI]!.cumulativeBalance) - 9} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--chart-ink)">{formatCompact(series[lastI]!.cumulativeBalance)}</text>
        )}
        {series.map((s, i) => (
          <rect key={`hit${s.month}`} x={x(i) - Math.max(step / 2, 8)} y={M.t} width={Math.max(step, 16)} height={IH + M.b} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {h && hover != null && (
        <Tooltip idx={hover} n={n}>
          <div className="mb-1 font-semibold">{monthLabel(h.month)}</div>
          <div className="flex justify-between"><span>Acumulado</span><span>{formatMoney(h.cumulativeBalance)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Resultado del mes</span><span>{formatMoney(h.balance)}</span></div>
          {h.invested !== 0 && <div className="flex justify-between text-slate-500"><span>Invertido</span><span>{formatMoney(h.invested)}</span></div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Misma información que los gráficos, para quien no distingue colores o prefiere números. */
export function SeriesTable({ series }: { series: DashboardSeriesPoint[] }) {
  const th = "px-2 py-1.5 text-right font-normal";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-xs tabular-nums">
        <thead className="text-slate-500">
          <tr><th className="px-2 py-1.5 text-left font-normal">Mes</th><th className={th}>Ingresos</th><th className={th}>Tarjetas</th><th className={th}>Recurrentes</th><th className={th}>Otros</th><th className={th}>Reintegros</th><th className={th}>Resultado</th><th className={th}>Acumulado</th></tr>
        </thead>
        <tbody className="divide-y">
          {[...series].reverse().map((s) => (
            <tr key={s.month}>
              <td className="px-2 py-1.5">{monthLabel(s.month)}</td>
              {[s.income, s.cards, s.recurring, s.other, s.reimbursements, s.balance, s.cumulativeBalance].map((v, i) => <td key={i} className="px-2 py-1.5 text-right">{formatMoney(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
