import type { ReactNode } from "react";

export interface StatItem { label: ReactNode; value: ReactNode; sub?: ReactNode; cls?: string }

/**
 * Fila de indicadores. En el celular es una lista (etiqueta a la izquierda, monto a la derecha)
 * para que los montos largos no se corten; desde sm son columnas centradas.
 */
export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <section className="divide-y rounded-xl bg-white shadow sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:block sm:p-3 sm:text-center">
          <div className="text-xs text-slate-500">{s.label}</div>
          <div className="text-right sm:text-center">
            <div className={`font-semibold tabular-nums ${s.cls ?? ""}`}>{s.value}</div>
            {s.sub && <div className="text-[11px] text-slate-500">{s.sub}</div>}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Botón de ícono con área táctil cómoda (✎, ✕, ‹ ›). */
export const iconBtn = "grid h-8 w-8 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-900";
export const iconBtnDanger = "grid h-8 w-8 shrink-0 place-items-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600";
