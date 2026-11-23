import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, comida: string, servicios: string, ocio: string, beto: string, visa: string, job: string;

const projection = async (from = "2026-05", months = 3) => (await call("GET", `/api/projection?from=${from}&months=${months}`)).json();
const cat = (p: any, id: string | null) => p.categories.find((c: any) => c.categoryId === id);

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  comida = (await call("POST", "/api/categories", { name: "Comida", type: "EXPENSE" })).json().id;
  servicios = (await call("POST", "/api/categories", { name: "Servicios", type: "EXPENSE" })).json().id;
  ocio = (await call("POST", "/api/categories", { name: "Ocio", type: "EXPENSE" })).json().id;
  beto = (await call("POST", "/api/persons", { name: "Beto" })).json().id;
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
  job = (await call("POST", "/api/jobs", { name: "Empresa", accountId: bank })).json().id;

  // historia: comida 30.000 + 30.000 + 60.000 (promedio 40.000); enero sin gastos queda fuera del promedio
  for (const [date, amount] of [["2026-02-10", 30000], ["2026-03-10", 30000], ["2026-04-10", 60000]] as const)
    await call("POST", "/api/transactions", { date, amount, type: "EXPENSE", categoryId: comida, accountId: bank });
  // recurrente: no entra al variable, se proyecta aparte
  await call("POST", "/api/recurring", { name: "Alquiler", amount: 100000, categoryId: servicios, accountId: bank, startMonth: "2026-01" });
  await call("POST", "/api/recurring/generate", { month: "2026-04" });
  // tarjeta: cuotas de abril, mayo y junio (cierre 25, vence el 5 del mes siguiente); la 1.ª es gasto variable de abril
  await call("POST", "/api/card-purchases", { cardId: visa, date: "2026-04-10", description: "Tele", categoryId: ocio, totalAmount: 30000, installmentCount: 3 });
  // deuda propia en 2 cuotas desde junio
  await call("POST", `/api/persons/${beto}/charges`, { direction: "I_OWE", categoryId: comida, description: "Prestamo", totalAmount: 20000, installmentCount: 2, firstMonth: "2026-06" });
  // sueldo: último neto 500.000
  const slip = await call("POST", "/api/payslips", { jobId: job, month: "2026-04", gross: 700000, net: 500000, date: "2026-04-30", accountId: bank });
  expect(slip.statusCode).toBe(201);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("proyección", () => {
  it("promedia el gasto variable de los últimos meses con datos, sin recurrentes ni cuotas comprometidas", async () => {
    const p = await projection();
    expect(p.baseMonths).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(p.partial).toBe(false);
    expect(cat(p, comida)).toMatchObject({ average: 40000, estimate: null, base: 40000 });
    expect(cat(p, ocio)).toMatchObject({ average: 3333.33 }); // 1.ª cuota de la Tele (10.000) / 3 meses
    expect(cat(p, servicios)).toBeUndefined();
  });

  it("arma ingresos y gastos mes a mes con aguinaldo, tarjeta por vencimiento y deudas", async () => {
    const [may, jun, jul] = (await projection()).months;
    expect(may).toMatchObject({ month: "2026-05", salary: 500000, sac: 0, income: 500000, recurring: 100000, cards: 10070, debts: 0, variable: 43333.33, expense: 153403.33, balance: 346596.67, cumulative: 346596.67 });
    // la tarjeta es mi neto del resumen: la cuota (10.000) + el 7 ‰ de sellos
    expect(jun).toMatchObject({ salary: 500000, sac: 250000, income: 750000, cards: 10070, debts: 10000 });
    expect(jul).toMatchObject({ sac: 0, cards: 10070, debts: 10000 });
    expect(jul.cumulative).toBeCloseTo(may.balance + jun.balance + jul.balance, 2);
  });

  it("un monto propio reemplaza al promedio y se puede quitar", async () => {
    expect((await call("PUT", "/api/projection/estimates", { categoryId: comida, amount: 50000 })).statusCode).toBe(204);
    let p = await projection();
    expect(cat(p, comida)).toMatchObject({ average: 40000, estimate: 50000, base: 50000 });
    expect(p.months[0].variable).toBe(53333.33);
    expect((await call("DELETE", `/api/projection/estimates/${comida}`)).statusCode).toBe(204);
    p = await projection();
    expect(cat(p, comida).estimate).toBeNull();
    const income = (await call("POST", "/api/categories", { name: "Sueldo", type: "INCOME" })).json().id;
    expect((await call("PUT", "/api/projection/estimates", { categoryId: income, amount: 5 })).statusCode).toBe(400);
  });

  it("la inflación sube recurrentes y variable desde el primer mes, no el sueldo ni las cuotas", async () => {
    expect((await call("PUT", "/api/projection/settings", { inflationPct: 10 })).statusCode).toBe(204);
    const p = await projection();
    expect(p.inflationPct).toBe(10);
    const [may, jun] = p.months;
    expect(may).toMatchObject({ recurring: 100000, variable: 43333.33 });
    expect(jun).toMatchObject({ salary: 500000, recurring: 110000, variable: 47666.66, cards: 10070, debts: 10000 });
    await call("PUT", "/api/projection/settings", { inflationPct: 0 });
  });

  it("sin meses completos con gastos usa el mes en curso y lo marca como parcial", async () => {
    const p = await projection("2026-02", 1);
    expect(p).toMatchObject({ baseMonths: ["2026-02"], partial: true });
    expect(cat(p, comida)).toMatchObject({ average: 30000, current: 30000 });
  });

  it("valida parámetros", async () => {
    expect((await call("GET", "/api/projection?from=mayo")).statusCode).toBe(400);
    expect((await call("GET", "/api/projection?months=48")).statusCode).toBe(400);
    expect((await call("PUT", "/api/projection/settings", { inflationPct: -1 })).statusCode).toBe(400);
  });
});
