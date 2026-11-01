import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, comida: string, ocio: string, sueldo: string, ana: string, visa: string;

const budgets = async (m: string) => (await call("GET", `/api/budgets?month=${m}`)).json();
const row = (b: any, id: string | null) => b.rows.find((r: any) => r.categoryId === id);

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  comida = (await call("POST", "/api/categories", { name: "Comida", type: "EXPENSE" })).json().id;
  ocio = (await call("POST", "/api/categories", { name: "Ocio", type: "EXPENSE" })).json().id;
  sueldo = (await call("POST", "/api/categories", { name: "Sueldo", type: "INCOME" })).json().id;
  ana = (await call("POST", "/api/persons", { name: "Ana" })).json().id;
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
  await call("PUT", "/api/budgets", { categoryId: comida, month: "2026-03", amount: 10000 });
  await call("PUT", "/api/budgets", { categoryId: ocio, month: "2026-03", amount: 600 });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("avance del presupuesto", () => {
  it("alerta al 80 % con movimientos y al 100 % sumando pendientes", async () => {
    await call("POST", "/api/transactions", { date: "2026-03-10", amount: 8500, type: "EXPENSE", categoryId: comida, accountId: bank });
    expect(row(await budgets("2026-03"), comida)).toMatchObject({ budget: 10000, spent: 8500, remaining: 1500, pct: 85, status: "WARN" });
    await call("POST", "/api/transactions", { date: "2026-03-11", amount: 1500, type: "EXPENSE", categoryId: comida, accountId: bank, status: "PENDING" });
    expect(row(await budgets("2026-03"), comida)).toMatchObject({ spent: 10000, remaining: 0, pct: 100, status: "OVER" });
  });

  it("incluye mi parte neta de las cuotas de tarjeta, no la de terceros", async () => {
    await call("POST", "/api/card-purchases", {
      cardId: visa, date: "2026-03-10", description: "Cine", categoryId: ocio, totalAmount: 3000, installmentCount: 3,
      shares: [{ personId: ana, mode: "PERCENT", value: 50 }],
    });
    expect(row(await budgets("2026-03"), ocio)).toMatchObject({ spent: 500, pct: 83.3, status: "WARN" });
  });

  it("pagar el resumen no suma gasto de nuevo", async () => {
    const before = (await budgets("2026-03")).totals.spentTotal;
    const pay = await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-04-05", accountId: bank });
    expect(pay.statusCode).toBe(200);
    expect((await budgets("2026-03")).totals.spentTotal).toBe(before);
  });

  it("muestra lo que no tiene categoría y totales", async () => {
    await call("POST", "/api/transactions", { date: "2026-03-12", amount: 200, type: "EXPENSE", accountId: bank });
    const b = await budgets("2026-03");
    expect(row(b, null)).toMatchObject({ name: "Sin categoría", budget: null, spent: 200, status: "NONE" });
    expect(b.totals).toMatchObject({ budget: 10600, spentInBudgeted: 10500, spentTotal: 10700, pct: 99.1, status: "WARN", warn: 1, over: 1 });
  });
});

describe("fijar y copiar", () => {
  it("solo sobre categorías de gastos", async () => {
    expect((await call("PUT", "/api/budgets", { categoryId: sueldo, month: "2026-03", amount: 5 })).statusCode).toBe(400);
    expect((await call("PUT", "/api/budgets", { categoryId: comida, month: "2026-03", amount: -5 })).statusCode).toBe(400);
  });

  it("copia al mes siguiente con +5 % y no pisa lo cargado", async () => {
    expect((await call("POST", "/api/budgets/copy", { fromMonth: "2026-03", toMonth: "2026-04", increasePercent: 5 })).json()).toEqual({ copied: 2, skipped: 0 });
    const b = await budgets("2026-04");
    expect(row(b, comida).budget).toBe(10500);
    expect(row(b, ocio)).toMatchObject({ budget: 630, spent: 500, status: "OK" }); // 2.ª cuota en abril
    await call("PUT", "/api/budgets", { categoryId: comida, month: "2026-04", amount: 9999 });
    expect((await call("POST", "/api/budgets/copy", { fromMonth: "2026-03", toMonth: "2026-04", increasePercent: 5 })).json()).toEqual({ copied: 0, skipped: 2 });
    expect(row(await budgets("2026-04"), comida).budget).toBe(9999);
    expect((await call("POST", "/api/budgets/copy", { fromMonth: "2026-03", toMonth: "2026-04", increasePercent: 5, overwrite: true })).json().copied).toBe(2);
    expect(row(await budgets("2026-04"), comida).budget).toBe(10500);
  });

  it("rechaza copiar un mes sobre sí mismo y permite borrar", async () => {
    expect((await call("POST", "/api/budgets/copy", { fromMonth: "2026-03", toMonth: "2026-03" })).statusCode).toBe(400);
    expect((await call("DELETE", `/api/budgets/${comida}/2026-04`)).statusCode).toBe(204);
    expect(row(await budgets("2026-04"), comida)).toMatchObject({ budget: null, status: "NONE" });
  });
});
