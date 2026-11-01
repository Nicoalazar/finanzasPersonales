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
