import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";
import { seedDefaults, seedLocal } from "../src/seed-data.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, comida: string, servicios: string, ocio: string, sueldo: string, ana: string, beto: string, visa: string;

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  comida = (await call("POST", "/api/categories", { name: "Comida", type: "EXPENSE" })).json().id;
  servicios = (await call("POST", "/api/categories", { name: "Servicios", type: "EXPENSE" })).json().id;
  ocio = (await call("POST", "/api/categories", { name: "Ocio", type: "EXPENSE" })).json().id;
  sueldo = (await call("POST", "/api/categories", { name: "Sueldo", type: "INCOME" })).json().id;
  ana = (await call("POST", "/api/persons", { name: "Ana" })).json().id;
  beto = (await call("POST", "/api/persons", { name: "Beto" })).json().id;
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;

  await call("POST", "/api/transactions", { date: "2026-03-01", amount: 1000000, type: "INCOME", categoryId: sueldo, accountId: bank });
  await call("POST", "/api/transactions", { date: "2026-03-10", amount: 50000, type: "EXPENSE", categoryId: comida, accountId: bank });
  await call("POST", "/api/recurring", { name: "Alquiler", amount: 100000, categoryId: servicios, accountId: bank, startMonth: "2026-03" });
  await call("POST", "/api/recurring/generate", { month: "2026-03" });
  await call("POST", "/api/card-purchases", {
    cardId: visa, date: "2026-03-10", description: "Cine", categoryId: ocio, totalAmount: 12000, installmentCount: 3,
    shares: [{ personId: ana, mode: "PERCENT", value: 50 }],
  });
  await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-03-28", accountId: bank });
  await call("POST", `/api/persons/${ana}/payments`, { date: "2026-03-30", amount: 2000, accountId: bank });
  await call("POST", `/api/persons/${beto}/charges`, { description: "Prestamo", totalAmount: 500, firstMonth: "2026-03" });
  await call("PUT", "/api/budgets", { categoryId: comida, month: "2026-03", amount: 50000 });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const dash = async (month = "2026-03", months = 3) => (await call("GET", `/api/dashboard?month=${month}&months=${months}`)).json();

describe("dashboard", () => {
  it("KPIs del mes: ingreso, gasto neto, resultado y ratios", async () => {
    expect((await dash()).kpis).toEqual({
      income: 1000000, expense: 154028, reimbursements: 2000, netExpense: 152028, balance: 847972,
      expenseRatio: 15.2, savingsRate: 84.8, cardNet: 2028, cardRatio: 0.2,
    });
  });

  it("serie mensual separa tarjetas, recurrentes y otros, con acumulado", async () => {
    const { series } = await dash();
    expect(series.map((s: any) => s.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(series[2]).toMatchObject({ cards: 4028, recurring: 100000, other: 50000, expense: 154028, reimbursements: 2000, netExpense: 152028, balance: 847972, cumulativeBalance: 847972 });
    expect(series[0]).toMatchObject({ income: 0, expense: 0, balance: 0 });
  });

  it("categorías: gasto del mes + tarjeta del mes anterior (la que se paga este mes), ordenadas", async () => {
    // marzo: la tarjeta es la de febrero (vacía), así que la cuota de Cine (marzo) no aparece
    const { categories } = await dash();
    expect(categories.map((c: any) => [c.name, c.amount, c.pct])).toEqual([["Servicios", 100000, 66.7], ["Comida", 50000, 33.3]]);
    // abril: la cuota de marzo (mi 50 % de Cine = 2000) entra como Ocio
    const abril = (await dash("2026-04")).categories;
    expect(abril.find((c: any) => c.name === "Ocio")).toMatchObject({ amount: 2000 });
  });

  it("presupuestos en alerta, deudores y patrimonio", async () => {
    const d = await dash();
    expect(d.budgets.totals).toMatchObject({ over: 1, warn: 0 });
    expect(d.budgets.flagged.map((r: any) => [r.name, r.status])).toEqual([["Comida", "OVER"]]);
    expect(d.debtors.map((p: any) => [p.name, p.balance])).toEqual([["Beto", 500]]); // Ana ya pagó todo
    expect(d.netWorth).toMatchObject({ cash: 947972, investments: 0, total: 947972 });
    expect(d.netWorth.accounts.reduce((a: number, x: any) => a + x.balance, 0)).toBeCloseTo(947972, 2);
  });

  it("agrupa las categorías sobrantes en 'Otras' y valida parámetros", async () => {
    for (let i = 0; i < 9; i++) {
      const id = (await call("POST", "/api/categories", { name: `Cat${i}`, type: "EXPENSE" })).json().id;
      await call("POST", "/api/transactions", { date: "2026-05-02", amount: 10 + i, type: "EXPENSE", categoryId: id, accountId: bank });
    }
    const { categories } = await dash("2026-05");
    expect(categories).toHaveLength(9);
    // mayo también trae la cuota de abril de "Cine" (Ocio 2000): 10 categorías con gasto → top 8 + Otras (11 + 10)
    expect(categories[0]).toMatchObject({ name: "Ocio", amount: 2000 });
    expect(categories.at(-1)).toMatchObject({ name: "Otras", amount: 21 });
    // la lista completa trae las 10 categorías sin agrupar, de mayor a menor
    const { allCategories } = await dash("2026-05");
    expect(allCategories).toHaveLength(10);
    expect(allCategories.some((c: any) => c.name === "Otras")).toBe(false);
    expect(allCategories.map((c: any) => c.amount)).toEqual([...allCategories.map((c: any) => c.amount)].sort((a: number, b: number) => b - a));
    expect((await call("GET", "/api/dashboard?month=2026-05&months=1")).statusCode).toBe(400);
    expect((await call("GET", "/api/dashboard?month=mayo")).statusCode).toBe(400);
  });
});

describe("exportación CSV", () => {
  it("exige sesión", async () => {
    expect((await app.inject({ method: "GET", url: "/api/export/transactions.csv?from=2026-03" })).statusCode).toBe(401);
  });

  it("exporta el mes con BOM, separador ; y decimales con coma", async () => {
    const res = await call("GET", "/api/export/transactions.csv?from=2026-03");
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("finanzas-2026-03.csv");
    const body = res.body;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("Fecha;Tipo;Estado;Categoría;Cuenta;Cuenta destino;Monto;Descripción");
    expect(lines).toHaveLength(6); // ingreso, comida, alquiler, pago del resumen, pago de Ana
    expect(lines).toContain("2026-03-10;Gasto;Pagado;Comida;Banco;;50000,00;");
    expect(lines.find((l) => l.includes("Alquiler"))).toContain(";Pendiente;Servicios;");
  });

  it("escapa comillas y separadores en la descripción", async () => {
    await call("POST", "/api/transactions", { date: "2026-04-02", amount: 10.5, type: "EXPENSE", accountId: bank, description: 'a;b "c"' });
    const lines = (await call("GET", "/api/export/transactions.csv?from=2026-04&to=2026-04")).body.slice(1).trim().split("\r\n");
    expect(lines[1]).toBe('2026-04-02;Gasto;Pagado;;Banco;;10,50;"a;b ""c"""');
  });

  it("valida el rango", async () => {
    expect((await call("GET", "/api/export/transactions.csv?from=2026-05&to=2026-03")).statusCode).toBe(400);
    expect((await call("GET", "/api/export/transactions.csv?from=2020-01&to=2026-12")).statusCode).toBe(400);
  });
});

describe("seed", () => {
  it("es idempotente y deja la categoría de reintegros marcada", async () => {
    await resetDb();
    await seedDefaults();
    await seedDefaults();
    expect(await prisma.category.count()).toBe(28); // 22 gastos + 5 ingresos + Reintegros
    expect(await prisma.category.count({ where: { isReimbursement: true } })).toBe(1);
    expect(await prisma.sharedGroup.findUnique({ where: { name: "Hogar" } })).toMatchObject({ myPercent: expect.anything() });
    expect(Number((await prisma.sharedGroup.findUniqueOrThrow({ where: { name: "Hogar" } })).myPercent)).toBe(35);
  });

  it("carga datos personales sin duplicar", async () => {
    const data = { accounts: [{ name: "Banco" }], cards: [{ name: "Visa", closingDay: 25, dueDay: 5 }], persons: ["Ana"] };
    await seedLocal(data);
    await seedLocal(data);
    expect([await prisma.account.count(), await prisma.creditCard.count(), await prisma.person.count()]).toEqual([1, 1, 1]);
  });
});
