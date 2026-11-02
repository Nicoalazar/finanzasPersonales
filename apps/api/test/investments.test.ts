import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, brubank: string;

const inv = async () => (await call("GET", "/api/investments")).json();
const balanceOf = async (id: string) => (await call("GET", "/api/accounts")).json().find((a: any) => a.id === id).balance;
const move = (kind: string, date: string, amount: number) => call("POST", "/api/investments/movements", { accountId: brubank, kind, otherAccountId: bank, date, amount });
const snap = (date: string, balance: number) => call("POST", "/api/investments/snapshots", { accountId: brubank, date, balance });

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  brubank = (await call("POST", "/api/accounts", { name: "Brubank", kind: "INVESTMENT" })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("depósitos y saldo real", () => {
  it("un depósito mueve plata entre cuentas y sube el teórico", async () => {
    expect((await move("DEPOSIT", "2026-01-05", 1000000)).statusCode).toBe(201);
    expect(await balanceOf(bank)).toBe(-1000000);
    expect(await balanceOf(brubank)).toBe(1000000);
    const a = (await inv()).accounts[0];
    expect(a).toMatchObject({ name: "Brubank", deposits: 1000000, withdrawals: 0, theoretical: 1000000, lastSnapshot: null, gain: null, currentEstimate: 1000000 });
  });

  it("la ganancia es el saldo real menos lo depositado", async () => {
    await snap("2026-01-31", 1010000);
    const a = (await inv()).accounts[0];
    expect(a).toMatchObject({ gain: 10000, gainPct: 1, currentEstimate: 1010000, lastSnapshot: { date: "2026-01-31", real: 1010000 } });
  });

  it("un depósito posterior al saldo real no cambia la ganancia pero sí la estimación", async () => {
    await move("DEPOSIT", "2026-02-10", 500000);
    const a = (await inv()).accounts[0];
    expect(a).toMatchObject({ theoretical: 1500000, gain: 10000, currentEstimate: 1510000 });
  });

  it("calcula ganancia del período y rendimiento entre saldos reales", async () => {
    await snap("2026-02-28", 1540000);
    const a = (await inv()).accounts[0];
    expect(a.snapshots.map((s: any) => s.date)).toEqual(["2026-02-28", "2026-01-31"]);
    expect(a.snapshots[0]).toMatchObject({ theoretical: 1500000, real: 1540000, gain: 40000, periodGain: 30000, returnPct: 1.99 });
    expect(a.snapshots[1]).toMatchObject({ gain: 10000, periodGain: 10000, returnPct: 1 });
  });

  it("anotar otra vez la misma fecha reemplaza el saldo", async () => {
    await snap("2026-02-28", 1550000);
    const a = (await inv()).accounts[0];
    expect(a.snapshots).toHaveLength(2);
    expect(a.gain).toBe(50000);
  });
});

describe("retiros y totales", () => {
  it("un retiro baja el teórico y devuelve plata a la otra cuenta", async () => {
    await move("WITHDRAWAL", "2026-03-05", 200000);
    const a = (await inv()).accounts[0];
    expect(a).toMatchObject({ withdrawals: 200000, theoretical: 1300000, currentEstimate: 1350000 });
    expect(await balanceOf(bank)).toBe(-1300000);
    expect(a.movements.map((m: any) => [m.kind, m.amount])).toEqual([["WITHDRAWAL", 200000], ["DEPOSIT", 500000], ["DEPOSIT", 1000000]]);
  });

  it("resume lo invertido por mes y los totales", async () => {
    const r = await inv();
    expect(r.byMonth).toEqual([
      { month: "2026-01", deposits: 1000000, withdrawals: 0, net: 1000000 },
      { month: "2026-02", deposits: 500000, withdrawals: 0, net: 500000 },
      { month: "2026-03", deposits: 0, withdrawals: 200000, net: -200000 },
    ]);
    expect(r.totals).toEqual({ theoretical: 1300000, currentEstimate: 1350000, gain: 50000 });
  });

  it("borrar un saldo real recalcula la ganancia", async () => {
    const id = (await inv()).accounts[0].snapshots[0].id;
    expect((await call("DELETE", `/api/investments/snapshots/${id}`)).statusCode).toBe(204);
    expect((await inv()).accounts[0]).toMatchObject({ gain: 10000, lastSnapshot: { date: "2026-01-31" } });
  });
});

describe("validaciones", () => {
  it("solo cuentas de tipo Inversión", async () => {
    expect((await call("POST", "/api/investments/snapshots", { accountId: bank, date: "2026-03-01", balance: 5 })).statusCode).toBe(400);
    expect((await call("POST", "/api/investments/movements", { accountId: bank, kind: "DEPOSIT", otherAccountId: brubank, date: "2026-03-01", amount: 5 })).statusCode).toBe(400);
  });
  it("rechaza misma cuenta, montos inválidos y cuentas inexistentes", async () => {
    expect((await call("POST", "/api/investments/movements", { accountId: brubank, kind: "DEPOSIT", otherAccountId: brubank, date: "2026-03-01", amount: 5 })).statusCode).toBe(400);
    expect((await move("DEPOSIT", "2026-03-01", -5)).statusCode).toBe(400);
    expect((await call("POST", "/api/investments/movements", { accountId: brubank, kind: "DEPOSIT", otherAccountId: "nope", date: "2026-03-01", amount: 5 })).statusCode).toBe(400);
  });
});

describe("gastos e ingresos directos", () => {
  it("pagar algo desde una cuenta de inversión baja la estimación igual que el saldo", async () => {
    const wallet = (await call("POST", "/api/accounts", { name: "Billetera", kind: "INVESTMENT", initialBalance: 1000 })).json().id;
    await call("POST", "/api/transactions", { date: "2026-05-02", amount: 300, type: "EXPENSE", accountId: wallet, description: "Compra" });
    await call("POST", "/api/transactions", { date: "2026-05-03", amount: 50, type: "INCOME", accountId: wallet, description: "Devolución" });
    const inv = (await call("GET", "/api/investments")).json().accounts.find((a: any) => a.accountId === wallet);
    const acc = (await call("GET", "/api/accounts")).json().find((a: any) => a.id === wallet);
    expect(inv.currentEstimate).toBe(750);
    expect(acc.balance).toBe(750);
    expect(inv.movements).toHaveLength(0);
  });
});
