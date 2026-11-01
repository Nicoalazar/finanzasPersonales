import { toCents } from "./money.js";

export interface Addition {
  name: string;
  percent: number; // 0.175 = 17,5 %
  multiplier?: number; // p. ej. años de antigüedad
}

export interface Deduction {
  name: string;
  percent?: number;
  fixed?: number;
  appliesToSac: boolean;
}

export interface PayslipInput {
  basic: number;
  additions: Addition[];
  deductions: Deduction[];
  overtimeHours?: number;
  nonRemunerativeBonus?: number;
  overtimeDivisor?: number; // 140 en el Excel
  overtimeFactor?: number; // 1,5
}

export interface PayslipResult {
  grossCents: number; // remunerativo (sin horas extra)
  overtimeCents: number;
  taxableCents: number; // sujeto a retención
  deductionsCents: number;
  bonusCents: number;
  netCents: number;
  lines: { name: string; amountCents: number }[];
}

const pct = (a: Addition) => a.percent * (a.multiplier ?? 1);

export function computePayslip(i: PayslipInput): PayslipResult {
  const add = i.additions.map((a) => ({ name: a.name, amount: i.basic * pct(a) }));
  const gross = i.basic + add.reduce((s, a) => s + a.amount, 0);
  const overtime = (i.overtimeHours ?? 0) * ((gross / (i.overtimeDivisor ?? 140)) * (i.overtimeFactor ?? 1.5));
  const taxable = gross + overtime;
  const ded = i.deductions.map((d) => ({
    name: d.name,
    amount: taxable * (d.percent ?? 0) + (d.fixed ?? 0),
  }));
  const deductions = ded.reduce((s, d) => s + d.amount, 0);
  const bonus = i.nonRemunerativeBonus ?? 0;
  return {
    grossCents: toCents(gross),
    overtimeCents: toCents(overtime),
    taxableCents: toCents(taxable),
    deductionsCents: toCents(deductions),
    bonusCents: toCents(bonus),
    netCents: toCents(taxable - deductions + bonus),
    lines: [
      ...add.map((a) => ({ name: a.name, amountCents: toCents(a.amount) })),
      ...ded.map((d) => ({ name: d.name, amountCents: -toCents(d.amount) })),
    ],
  };
}

export interface SacResult {
  grossCents: number;
  deductionsCents: number;
  netCents: number;
}

/** SAC = mayor remunerativo del semestre / 2; descuentos solo de los conceptos con appliesToSac. */
export function computeSac(semesterTaxable: number[], deductions: Deduction[]): SacResult {
  const gross = Math.max(...semesterTaxable) / 2;
  const ded = deductions
    .filter((d) => d.appliesToSac)
    .reduce((s, d) => s + gross * (d.percent ?? 0) + (d.fixed ?? 0), 0);
  return { grossCents: toCents(gross), deductionsCents: toCents(ded), netCents: toCents(gross - ded) };
}
