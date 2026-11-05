import type { ReactNode } from "react";
import { monthLabel, shiftMonth } from "../lib/format";

const arrow = "grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-lg shadow";

/**
 * Selector de mes con acciones a la derecha. En el celular el selector ocupa todo el ancho
 * y las acciones bajan a una fila propia, repartidas en partes iguales.
 */
export function MonthNav({ month, onChange, children }: { month: string; onChange: (m: string) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex w-full items-center gap-1 sm:w-auto sm:gap-2">
        <button className={arrow} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mes anterior">‹</button>
        <h1 className="flex-1 text-center text-lg font-semibold sm:min-w-44 sm:flex-none">{monthLabel(month)}</h1>
        <button className={arrow} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mes siguiente">›</button>
      </div>
      {children && (
        <div className="flex w-full items-center gap-2 text-sm sm:w-auto [&>*]:flex-1 [&>*]:text-center sm:[&>*]:flex-none">{children}</div>
      )}
    </div>
  );
}
