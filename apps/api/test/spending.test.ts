import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, comida: string, ocio: string, ana: string, visa: string;

const spending = async (m: string) => (await call("GET", `/api/spending?month=${m}`)).json();
const row = (b: any, id: string | null) => b.rows.find((r: any) => r.categoryId === id);

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  comida = (await call("POST", "/api/categories", { name: "Comida", type: "EXPENSE" })).json().id;
  ocio = (await call("POST", "/api/categories", { name: "Ocio", type: "EXPENSE" })).json().id;
  ana = (await call("POST", "/api/persons", { name: "Ana" })).json().id;
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("gasto del mes por categoría", () => {
  it("suma movimientos pagados y pendientes, y lista las categorías sin gasto en 0", async () => {
    await call("POST", "/api/transactions", { date: "2026-03-10", amount: 8500, type: "EXPENSE", categoryId: comida, accountId: bank });
    await call("POST", "/api/transactions", { date: "2026-03-11", amount: 1500, type: "EXPENSE", categoryId: comida, accountId: bank, status: "PENDING" });
    const s = await spending("2026-03");
    expect(row(s, comida).spent).toBe(10000);
    expect(row(s, ocio).spent).toBe(0);
  });

  it("incluye mi parte neta de las cuotas de tarjeta, no la de terceros", async () => {
    await call("POST", "/api/card-purchases", {
      cardId: visa, date: "2026-03-10", description: "Cine", categoryId: ocio, totalAmount: 3000, installmentCount: 3,
      shares: [{ personId: ana, mode: "PERCENT", value: 50 }],
    });
    expect(row(await spending("2026-03"), ocio).spent).toBe(500);
  });

  it("pagar el resumen no suma gasto de nuevo", async () => {
    const before = (await spending("2026-03")).total;
    const pay = await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-04-05", accountId: bank });
    expect(pay.statusCode).toBe(200);
    expect((await spending("2026-03")).total).toBe(before);
  });

  it("muestra lo que no tiene categoría y el total", async () => {
    await call("POST", "/api/transactions", { date: "2026-03-12", amount: 200, type: "EXPENSE", accountId: bank });
    const s = await spending("2026-03");
    expect(row(s, null)).toMatchObject({ name: "Sin categoría", spent: 200 });
    expect(s.total).toBe(10700);
    expect((await call("GET", "/api/spending?month=marzo")).statusCode).toBe(400);
  });
});
