import { describe, expect, it } from "vitest";
import { splitInstallments, firstStatementMonth, addMonths } from "./installments.js";
import { computeStatement, householdShareCents, installmentArsCents } from "./cardStatement.js";
import { purchaseInput } from "../schemas/index.js";
import { parseAmount, parseCsv, parseFormCsv, parseFormDate, sharedMonthCents } from "./sharedForm.js";

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

import { sacSuggestionCents, semesterMonths } from "./salary.js";

describe("sueldos", () => {
  it("semestre de un mes", () => {
    expect(semesterMonths("2026-06")).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(semesterMonths("2026-07")[0]).toBe("2026-07");
    expect(semesterMonths("2026-12")[5]).toBe("2026-12");
  });
  it("SAC = mitad del mayor bruto del semestre (Aguinaldo1: 1.545.966,04 → 772.983,02)", () => {
    expect(sacSuggestionCents([100000000, 154596604, 120000000])).toBe(77298302);
    expect(sacSuggestionCents([])).toBeNull();
  });
});

import { currentEstimateCents, investmentRows, theoreticalAt } from "./investments.js";

describe("inversiones", () => {
  const flows = [{ date: "2026-01-05", cents: 100000000 }, { date: "2026-02-10", cents: 50000000 }];
  const snaps = [
    { id: "a", date: "2026-01-31", balanceCents: 101000000 },
    { id: "b", date: "2026-02-28", balanceCents: 154000000 },
  ];
  it("saldo teórico a una fecha", () => {
    expect(theoreticalAt(0, flows, "2026-01-31")).toBe(100000000);
    expect(theoreticalAt(0, flows, "2026-02-28")).toBe(150000000);
    expect(theoreticalAt(20000, flows, "2026-01-01")).toBe(20000);
  });
  it("ganancia acumulada, del período y rendimiento", () => {
    const [jan, feb] = investmentRows(0, flows, snaps);
    expect(jan).toMatchObject({ theoreticalCents: 100000000, gainCents: 1000000, periodGainCents: 1000000, returnPct: 1 });
    expect(feb).toMatchObject({ theoreticalCents: 150000000, gainCents: 4000000, periodGainCents: 3000000, returnPct: 1.99 });
  });
  it("una pérdida es una ganancia negativa", () => {
    const [r] = investmentRows(0, flows, [{ id: "x", date: "2026-01-31", balanceCents: 99000000 }]);
    expect(r).toMatchObject({ gainCents: -1000000, returnPct: -1 });
  });
  it("estimación actual = último real + movimientos posteriores", () => {
    expect(currentEstimateCents(0, flows, [snaps[0]!])).toBe(101000000 + 50000000);
    expect(currentEstimateCents(0, flows, snaps)).toBe(154000000);
    expect(currentEstimateCents(5000, flows, [])).toBe(150005000);
  });
});

describe("gastos compartidos (formulario)", () => {
  const header = "Marca temporal,Pagado por:,Elija el tipo:,Monto,Elija el Servicio,Monto del Servicio,Monto de la Compra,Concepto,Monto Pagado,Detalle de Gasto,Monto del Gasto,Elija Plataforma,Monto de la Plataforma,Elija el gasto,Monto de la Salida,Gasto,Monto";
  const csv = [
    header,
    '2/01/2024 19:48:23,Nico,Varios,,,,,,,Ollas,"25349,02",,,,,,',
    '2/01/2024 19:50:35,Nico,Mercadería,,,,"37909,75",,,,,,,,,,',
    '4/01/2024 13:38:34,Euge,Servicios,,Electricidad,"8991,34",,,,,,,,,,,',
    "4/01/2024 19:49:11,Euge,Alquiler,,,,,Alquiler,96897,,,,,,,,",
    '6/01/2024 18:37:44,Euge,Recreación,,,,,,,,,,,"Servilletero y, vasos",3600,,',
    "7/01/2024 10:00:00,Guille,Varios,,,,,,,Tierra,1500,,,,,,",
    "8/01/2024 10:00:00,Nico,Varios,,,,,,,Sin monto,,,,,,,",
  ].join("\n");

  it("montos y fechas a la argentina", () => {
    expect(parseAmount("25349,02")).toBe(25349.02);
    expect(parseAmount("83.665,47")).toBe(83665.47);
    expect(parseAmount("1.200")).toBe(1200);
    expect(parseAmount("3199.33")).toBe(3199.33);
    expect(parseAmount("$ 1.500")).toBe(1500);
    expect(parseAmount("abc")).toBeNull();
    expect(parseFormDate("2/01/2024 19:48:23")).toBe("2024-01-02");
    expect(parseFormDate("2024-11-05 10:00")).toBe("2024-11-05");
    expect(parseCsv('a;"b;c"\r\n1;2')).toEqual([["a", "b;c"], ["1", "2"]]);
  });

  it("lee cada tipo con sus columnas y reporta las filas que no entiende", () => {
    const { rows, errors } = parseFormCsv(csv, { me: "Nico", partner: "euge" });
    expect(rows.map((r) => [r.date, r.payer, r.kind, r.description, r.amount])).toEqual([
      ["2024-01-02", "ME", "Varios", "Ollas", 25349.02],
      ["2024-01-02", "ME", "Mercadería", "", 37909.75],
      ["2024-01-04", "PARTNER", "Servicios", "Electricidad", 8991.34],
      ["2024-01-04", "PARTNER", "Alquiler", "Alquiler", 96897],
      ["2024-01-06", "PARTNER", "Recreación", "Servilletero y, vasos", 3600],
    ]);
    expect(errors.map((e) => e.line)).toEqual([7, 8]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("cierre del mes: mi parte por tipo y saldo", () => {
    const m = sharedMonthCents([
      { payer: "ME", kind: "Mercadería", cents: 90_000_00 },
      { payer: "PARTNER", kind: "Alquiler", cents: 110_000_00 },
    ], 35);
    expect(m.totalCents).toBe(200_000_00);
    expect(m.myShareCents).toBe(70_000_00);
    expect(m.byKind.get("Alquiler")!.myCents).toBe(38_500_00);
    expect(m.balanceCents).toBe(20_000_00); // Euge me debe 20.000
  });
});

describe("compras en dólares", () => {
  const usd = { currency: "USD" as const, amountCents: 5000, estimateRate: 1200 };
  it("las de pesos no se convierten", () => {
    expect(installmentArsCents({ currency: "ARS", amountCents: 12345, estimateRate: null }, 1500)).toEqual({ cents: 12345, rate: null, estimated: false });
  });
  it("sin cotización real usa la estimada y avisa", () => {
    expect(installmentArsCents(usd, null)).toEqual({ cents: 6000000, rate: 1200, estimated: true });
  });
  it("la cotización real del resumen pisa a la estimada", () => {
    expect(installmentArsCents(usd, 1250.5)).toEqual({ cents: 6252500, rate: 1250.5, estimated: false });
  });
  it("redondea al centavo", () => {
    expect(installmentArsCents({ currency: "USD", amountCents: 333, estimateRate: 1234.5678 }, null).cents).toBe(411111); // 333 × 1234,5678 = 411111,08
  });
  it("una compra USD sin ninguna cotización es un error, no un cero silencioso", () => {
    expect(() => installmentArsCents({ currency: "USD", amountCents: 100, estimateRate: null }, null)).toThrow();
  });

  const base = { cardId: "c", date: "2026-03-10", description: "x", totalAmount: 50 };
  it("USD es en un solo pago", () => {
    expect(purchaseInput.safeParse({ ...base, currency: "USD", installmentCount: 3 }).success).toBe(false);
    expect(purchaseInput.safeParse({ ...base, currency: "USD" }).success).toBe(true);
    expect(purchaseInput.safeParse({ ...base, installmentCount: 3 }).success).toBe(true);
  });
  it("USD es mío o de una sola persona al 100%", () => {
    const share = (value: number, mode: "PERCENT" | "AMOUNT" = "PERCENT", personId = "p1") => ({ personId, mode, value });
    expect(purchaseInput.safeParse({ ...base, currency: "USD", shares: [share(100)] }).success).toBe(true);
    expect(purchaseInput.safeParse({ ...base, currency: "USD", shares: [share(50)] }).success).toBe(false);
    expect(purchaseInput.safeParse({ ...base, currency: "USD", shares: [share(50), share(50, "PERCENT", "p2")] }).success).toBe(false);
    expect(purchaseInput.safeParse({ ...base, currency: "USD", shares: [share(100, "AMOUNT")] }).success).toBe(false);
    expect(purchaseInput.safeParse({ ...base, shares: [share(50), share(50, "PERCENT", "p2")] }).success).toBe(true);
  });
});
