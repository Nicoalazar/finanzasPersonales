import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let camila: string, bank: string, paymentId: string;

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  const visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
  camila = (await call("POST", "/api/persons", { name: "Camila" })).json().id;
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  await call("POST", "/api/card-purchases", {
    cardId: visa, date: "2026-03-10", description: "Pasajes", totalAmount: 12000, installmentCount: 3,
    shares: [{ personId: camila, mode: "PERCENT", value: 50 }],
  });
  await call("POST", `/api/persons/${camila}/charges`, { description: "Prestamo", totalAmount: 3000, installmentCount: 2, firstMonth: "2026-04" });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const summary = async (asOf: string) => (await call("GET", `/api/persons/summary?asOf=${asOf}`)).json()[0];

describe("saldos de personas", () => {
  it("devenga por mes: cuotas de tarjeta + cargos manuales", async () => {
    expect(await summary("2026-03")).toMatchObject({ accrued: 2000, paid: 0, balance: 2000, upcoming: 7000 });
    expect(await summary("2026-04")).toMatchObject({ accrued: 5500, balance: 5500, upcoming: 3500 });
  });

  it("detalle agrupado por mes", async () => {
    const d = (await call("GET", `/api/persons/${camila}?asOf=2026-04`)).json();
    expect(d.months.map((m: any) => [m.month, m.total])).toEqual([["2026-03", 2000], ["2026-04", 3500], ["2026-05", 3500]]);
    expect(d.months[1].lines.map((l: any) => l.kind).sort()).toEqual(["CARD", "CHARGE"]);
  });
});

describe("pagos → reintegros", () => {
  it("el pago genera un ingreso en Reintegros y baja el saldo", async () => {
    const r = await call("POST", `/api/persons/${camila}/payments`, { date: "2026-04-10", amount: 1500, accountId: bank });
    expect(r.statusCode).toBe(201);
    paymentId = r.json().id;
    expect(await summary("2026-04")).toMatchObject({ paid: 1500, balance: 4000 });
    expect((await call("GET", "/api/accounts")).json()[0].balance).toBe(1500);
    const cats = (await call("GET", "/api/categories")).json().filter((c: any) => c.name === "Reintegros");
    expect(cats).toHaveLength(1);
  });

  it("el resumen del mes separa reintegros del ingreso y calcula gasto neto", async () => {
    await call("POST", "/api/transactions", { date: "2026-04-12", amount: 4000, type: "EXPENSE", accountId: bank });
    const { summary } = (await call("GET", "/api/transactions?month=2026-04")).json();
    expect(summary).toEqual({ income: 0, expense: 4000, reimbursements: 1500, netExpense: 2500, balance: -2500 });
  });

  it("reutiliza la categoría y borrar el pago elimina el ingreso", async () => {
    await call("POST", `/api/persons/${camila}/payments`, { date: "2026-04-11", amount: 100, accountId: bank });
    expect((await call("GET", "/api/categories")).json().filter((c: any) => c.name === "Reintegros")).toHaveLength(1);
    expect((await call("DELETE", `/api/persons/${camila}/payments/${paymentId}`)).statusCode).toBe(204);
    expect((await call("GET", "/api/accounts")).json()[0].balance).toBe(100 - 4000);
    expect((await summary("2026-04")).paid).toBe(100);
  });

  it("valida cuenta y monto", async () => {
    expect((await call("POST", `/api/persons/${camila}/payments`, { date: "2026-04-11", amount: 5, accountId: "nope" })).statusCode).toBe(400);
    expect((await call("POST", `/api/persons/${camila}/payments`, { date: "2026-04-11", amount: -5, accountId: bank })).statusCode).toBe(400);
  });
});
