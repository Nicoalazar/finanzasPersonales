import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, janId: string;

const balance = async () => (await call("GET", "/api/accounts")).json()[0].balance;
const incomeOf = async (m: string) => (await call("GET", `/api/transactions?month=${m}`)).json();

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("recibos", () => {
  it("al guardar genera el ingreso por el neto, en la fecha de cobro", async () => {
    const r = await call("POST", "/api/payslips", { month: "2026-01", gross: 1500000, net: 1200000, date: "2026-02-01", accountId: bank });
    expect(r.statusCode).toBe(201);
    janId = r.json().id;
    expect(r.json()).toMatchObject({ month: "2026-01", kind: "MONTHLY", gross: 1500000, net: 1200000, date: "2026-02-01", status: "PAID" });
    const feb = await incomeOf("2026-02");
    expect(feb.items).toHaveLength(1);
    expect(feb.items[0]).toMatchObject({ type: "INCOME", amount: 1200000, description: "Sueldo 2026-01" });
    expect(feb.summary.income).toBe(1200000);
    expect(await balance()).toBe(1200000);
    const cats = (await call("GET", "/api/categories")).json();
    expect(cats.find((c: any) => c.id === feb.items[0].categoryId)).toMatchObject({ name: "Sueldo", type: "INCOME" });
  });

  it("no permite repetir mes y tipo", async () => {
    const dup = await call("POST", "/api/payslips", { month: "2026-01", gross: 1, net: 1, date: "2026-02-01", accountId: bank });
    expect(dup.statusCode).toBe(409);
  });

  it("valida montos y cuenta", async () => {
    expect((await call("POST", "/api/payslips", { month: "2026-05", gross: 100, net: -1, date: "2026-06-01", accountId: bank })).statusCode).toBe(400);
    expect((await call("POST", "/api/payslips", { month: "2026-05", gross: 100, net: 90, date: "2026-06-01", accountId: "nope" })).statusCode).toBe(400);
  });

  it("editar bruto/neto/fecha mantiene sincronizado el ingreso", async () => {
    const r = await call("PATCH", `/api/payslips/${janId}`, { net: 1300000, gross: 1600000, date: "2026-02-03" });
    expect(r.json()).toMatchObject({ gross: 1600000, net: 1300000, date: "2026-02-03" });
    expect((await incomeOf("2026-02")).items[0]).toMatchObject({ amount: 1300000, date: "2026-02-03" });
    expect(await balance()).toBe(1300000);
  });

  it("puede cargarse como pendiente: no suma al saldo hasta cobrarlo", async () => {
    await call("POST", "/api/payslips", { month: "2026-02", gross: 1400000, net: 1100000, date: "2026-03-01", accountId: bank, paid: false });
    expect((await incomeOf("2026-03")).items[0].status).toBe("PENDING");
    expect(await balance()).toBe(1300000);
  });

  it("el historial viene ordenado del más nuevo al más viejo", async () => {
    await call("POST", "/api/payslips", { month: "2026-03", gross: 1545966.04, net: 1250000, date: "2026-04-01", accountId: bank });
    const list = (await call("GET", "/api/payslips")).json();
    expect(list.map((p: any) => p.month)).toEqual(["2026-03", "2026-02", "2026-01"]);
  });
});

describe("SAC", () => {
  it("sugiere la mitad del mayor bruto del semestre", async () => {
    expect((await call("GET", "/api/payslips/sac-suggestion?month=2026-06")).json()).toEqual({ month: "2026-06", basedOnMonths: 3, suggestedGross: 800000 });
    expect((await call("GET", "/api/payslips/sac-suggestion?month=2026-12")).json()).toMatchObject({ basedOnMonths: 0, suggestedGross: null });
  });

  it("el SAC va a su propia categoría y convive con el sueldo del mismo mes", async () => {
    const r = await call("POST", "/api/payslips", { month: "2026-06", kind: "SAC", gross: 800000, net: 650000, date: "2026-06-30", accountId: bank });
    expect(r.statusCode).toBe(201);
    const cats = (await call("GET", "/api/categories")).json();
    const tx = (await incomeOf("2026-06")).items[0];
    expect(cats.find((c: any) => c.id === tx.categoryId).name).toBe("SAC");
    const sueldoJunio = await call("POST", "/api/payslips", { month: "2026-06", gross: 1, net: 1, date: "2026-07-01", accountId: bank });
    expect(sueldoJunio.statusCode).toBe(201);
  });
});

describe("baja", () => {
  it("borrar el recibo borra su ingreso", async () => {
    expect((await call("DELETE", `/api/payslips/${janId}`)).statusCode).toBe(204);
    expect((await incomeOf("2026-02")).items).toHaveLength(0);
    expect((await call("GET", "/api/payslips")).json().map((p: any) => p.id)).not.toContain(janId);
  });
});
