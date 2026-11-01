import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, wallet: string, food: string, salary: string;

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco", initialBalance: 1000 })).json().id;
  wallet = (await call("POST", "/api/accounts", { name: "Billetera", kind: "WALLET" })).json().id;
  food = (await call("POST", "/api/categories", { name: "Comida", type: "EXPENSE" })).json().id;
  salary = (await call("POST", "/api/categories", { name: "Sueldo", type: "INCOME" })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("auth", () => {
  it("rechaza sin cookie", async () => {
    expect((await app.inject({ method: "GET", url: "/api/accounts" })).statusCode).toBe(401);
  });
});

describe("movimientos", () => {
  it("calcula saldos con ingresos, gastos, transferencias y pendientes", async () => {
    await call("POST", "/api/transactions", { date: "2026-03-05", amount: 5000, type: "INCOME", categoryId: salary, accountId: bank });
    await call("POST", "/api/transactions", { date: "2026-03-06", amount: 1200.5, type: "EXPENSE", categoryId: food, accountId: bank });
    await call("POST", "/api/transactions", { date: "2026-03-07", amount: 800, type: "TRANSFER", accountId: bank, toAccountId: wallet });
    await call("POST", "/api/transactions", { date: "2026-03-08", amount: 999, type: "EXPENSE", categoryId: food, accountId: bank, status: "PENDING" });
    const accounts = (await call("GET", "/api/accounts")).json();
    expect(accounts.find((a: any) => a.id === bank).balance).toBe(3999.5);
    expect(accounts.find((a: any) => a.id === wallet).balance).toBe(800);
  });

  it("resume el mes y filtra por período", async () => {
    await call("POST", "/api/transactions", { date: "2026-04-01", amount: 10, type: "EXPENSE", categoryId: food, accountId: bank });
    const r = (await call("GET", "/api/transactions?month=2026-03")).json();
    expect(r.items).toHaveLength(4);
    expect(r.summary).toEqual({ income: 5000, expense: 2199.5, reimbursements: 0, netExpense: 2199.5, balance: 2800.5 });
    expect((await call("GET", "/api/transactions?month=2026-04")).json().items).toHaveLength(1);
  });

  it("valida categoría vs tipo y transferencias", async () => {
    const wrongCat = await call("POST", "/api/transactions", { date: "2026-03-01", amount: 5, type: "EXPENSE", categoryId: salary, accountId: bank });
    expect(wrongCat.statusCode).toBe(400);
    const sameAcc = await call("POST", "/api/transactions", { date: "2026-03-01", amount: 5, type: "TRANSFER", accountId: bank, toAccountId: bank });
    expect(sameAcc.statusCode).toBe(400);
    const badAmount = await call("POST", "/api/transactions", { date: "2026-03-01", amount: -5, type: "EXPENSE", accountId: bank });
    expect(badAmount.statusCode).toBe(400);
  });

  it("editar la fecha cambia el período; borrar funciona; categoría en uso no se borra", async () => {
    const list = (await call("GET", "/api/transactions?month=2026-04")).json().items;
    const id = list[0].id;
    const patched = (await call("PATCH", `/api/transactions/${id}`, { date: "2026-05-02" })).json();
    expect(patched.period).toBe("2026-05");
    expect((await call("DELETE", `/api/transactions/${id}`)).statusCode).toBe(204);
    expect((await call("DELETE", `/api/categories/${food}`)).statusCode).toBe(409);
  });
});
