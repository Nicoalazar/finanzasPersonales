import { describe, expect, it } from "vitest";
import { splitInstallments, firstStatementMonth, addMonths } from "./installments.js";
import { computeStatement, householdShareCents } from "./cardStatement.js";
import { computePayslip, computeSac, type Deduction, type Addition } from "./payslip.js";

const additions: Addition[] = [
  { name: "Título secundario", percent: 0.175 },
  { name: "Antigüedad", percent: 0.02, multiplier: 8 },
  { name: "Adicional por grado", percent: 0.27 },
  { name: "Permanencia", percent: 0.13999111738905201 },
  { name: "Capacitación", percent: 0.1 },
];
const deductions: Deduction[] = [
  { name: "Jubilación", percent: 0.11, appliesToSac: true },
  { name: "Ley 19032", percent: 0.03, appliesToSac: true },
  { name: "Damsu", percent: 0.03, appliesToSac: true },
  { name: "APUNSJ", percent: 0.02, appliesToSac: false },
  { name: "Seguro de vida", fixed: 3.8, appliesToSac: false },
];

describe("cuotas", () => {
  it("20000 en 3 suma exacto", () => {
    const p = splitInstallments(20000, 3);
    expect(p).toEqual([666667, 666667, 666666]);
    expect(p.reduce((a, b) => a + b)).toBe(2000000);
  });
  it("mes de resumen según cierre", () => {
    expect(firstStatementMonth(new Date("2026-03-20T12:00:00Z"), 25)).toBe("2026-03");
    expect(firstStatementMonth(new Date("2026-03-28T12:00:00Z"), 25)).toBe("2026-04");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
});

describe("resumen de tarjeta y hogar", () => {
  it("impuesto 7‰ del subtotal Visa", () => {
    const r = computeStatement({ installmentsCents: [37623123], stampTaxRate: 0.007 });
    expect(r.stampTaxCents).toBe(263362);
  });
  it("Hogar 35%", () => {
    expect(householdShareCents(121556465, 35)).toBe(42544763);
  });
});

describe("recibo de sueldo", () => {
  it("Julio6: neto 1.472.228,69", () => {
    const r = computePayslip({ basic: 837926.00648899993, additions, deductions, nonRemunerativeBonus: 220000 });
    expect(r.taxableCents).toBe(154596604);
    expect(r.deductionsCents).toBe(29373735);
    expect(r.netCents).toBe(147222869);
  });
  it("SAC: neto 641.575,91", () => {
    const r = computeSac([1545966.039001486], deductions);
    expect(r.grossCents).toBe(77298302);
    expect(r.netCents).toBe(64157591);
  });
});

import { dateInMonth, defaultClosingDate, defaultDueDate, statementMonthForPurchase } from "./cardDates.js";

describe("fechas de tarjeta", () => {
  it("ajusta el día al largo del mes", () => {
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(defaultClosingDate("2026-04", 25)).toBe("2026-04-25");
  });
  it("vencimiento del mismo mes o del siguiente según el cierre", () => {
    expect(defaultDueDate("2026-03", 25, 5)).toBe("2026-04-05");
    expect(defaultDueDate("2026-03", 5, 20)).toBe("2026-03-20");
    expect(defaultDueDate("2026-12", 25, 5)).toBe("2027-01-05");
  });
  it("compra después del cierre real pasa al mes siguiente", () => {
    expect(statementMonthForPurchase("2026-03-26", "2026-03-27")).toBe("2026-03");
    expect(statementMonthForPurchase("2026-03-28", "2026-03-27")).toBe("2026-04");
  });
});

import { nextOccurrences, occursIn, percentAt, priceAt, recurringCents } from "./recurrence.js";

describe("recurrentes", () => {
  it("frecuencias desde el mes de inicio", () => {
    const patente = { frequency: "BIMONTHLY" as const, startMonth: "2026-01" };
    expect([1, 2, 3, 4, 5].map((m) => occursIn(patente, `2026-0${m}`))).toEqual([true, false, true, false, true]);
    expect(occursIn({ frequency: "YEARLY", startMonth: "2026-03" }, "2027-03")).toBe(true);
    expect(occursIn({ frequency: "YEARLY", startMonth: "2026-03" }, "2027-04")).toBe(false);
  });
  it("respeta inicio y fin", () => {
    const r = { frequency: "MONTHLY" as const, startMonth: "2026-02", endMonth: "2026-04" };
    expect(["2026-01", "2026-02", "2026-04", "2026-05"].map((m) => occursIn(r, m))).toEqual([false, true, true, false]);
    expect(nextOccurrences({ frequency: "BIMONTHLY", startMonth: "2026-01" }, "2026-02", 2)).toEqual(["2026-03", "2026-05"]);
  });
  it("precio vigente: alquiler +10% y cochera 78k→91k", () => {
    const prices = [{ fromMonth: "2026-01", amount: 818760.95 }, { fromMonth: "2026-03", amount: 900637.05 }];
    expect(priceAt(prices, "2026-02")).toBe(818760.95);
    expect(priceAt(prices, "2026-07")).toBe(900637.05);
    expect(priceAt(prices, "2025-12")).toBe(0);
  });
  it("porcentaje del grupo mes a mes con herencia", () => {
    const o = [{ month: "2026-03", percent: 40 }, { month: "2026-05", percent: 30 }];
    expect([ "2026-01", "2026-03", "2026-04", "2026-05", "2026-09"].map((m) => percentAt(35, o, m))).toEqual([35, 40, 40, 30, 30]);
  });
  it("mi parte: 35% del total Hogar", () => {
    expect(recurringCents(121556465, 35)).toBe(42544763);
    expect(recurringCents(100000, null)).toBe(100000);
  });
});

import { budgetStatus, increaseCents } from "./budget.js";

describe("presupuestos", () => {
  it("alerta al 80 % y al 100 %", () => {
    expect(budgetStatus(7999, 10000)).toEqual({ pct: 80, status: "OK" });
    expect(budgetStatus(8000, 10000)).toEqual({ pct: 80, status: "WARN" });
    expect(budgetStatus(9999, 10000).status).toBe("WARN");
    expect(budgetStatus(10000, 10000)).toEqual({ pct: 100, status: "OVER" });
    expect(budgetStatus(15000, 10000)).toEqual({ pct: 150, status: "OVER" });
  });
  it("sin presupuesto no hay estado", () => {
    expect(budgetStatus(500, null)).toEqual({ pct: null, status: "NONE" });
    expect(budgetStatus(500, 0).status).toBe("NONE");
  });
  it("copia con +5 %", () => {
    expect(increaseCents(1000000, 5)).toBe(1050000);
    expect(increaseCents(33333, 5)).toBe(35000);
  });
});
