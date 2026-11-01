import { addMonths } from "./installments.js";

const daysIn = (yearMonth: string): number => {
  const [y, m] = yearMonth.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Día `day` del mes (YYYY-MM-DD), ajustado al último día si el mes es más corto. */
export function dateInMonth(yearMonth: string, day: number): string {
  return `${yearMonth}-${String(Math.min(day, daysIn(yearMonth))).padStart(2, "0")}`;
}

/** Cierre por defecto del resumen del mes: closingDay de ese mes. */
export const defaultClosingDate = (statementMonth: string, closingDay: number) => dateInMonth(statementMonth, closingDay);

/** Vencimiento por defecto: si vence un día posterior al cierre es del mismo mes, si no, del mes siguiente. */
export function defaultDueDate(statementMonth: string, closingDay: number, dueDay: number): string {
  return dateInMonth(dueDay > closingDay ? statementMonth : addMonths(statementMonth, 1), dueDay);
}

/** Resumen en el que cae una compra: el del mes de la compra, o el siguiente si pasó el cierre real de ese mes. */
export function statementMonthForPurchase(purchaseDate: string, closingDateOfThatMonth: string): string {
  const month = purchaseDate.slice(0, 7);
  return purchaseDate > closingDateOfThatMonth ? addMonths(month, 1) : month;
}
