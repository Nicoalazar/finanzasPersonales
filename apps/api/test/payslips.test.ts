import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, cash: string, janId: string, uni: string, bar: string;

const balance = async () => (await call("GET", "/api/accounts")).json().find((a: any) => a.name === "Banco").balance;
const incomeOf = async (m: string) => (await call("GET", `/api/transactions?month=${m}`)).json();

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  uni = (await call("POST", "/api/jobs", { name: "Facultad", accountId: bank })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("recibos", () => {
  it("al guardar genera el ingreso por el neto, en la fecha de cobro", async () => {
    const r = await call("POST", "/api/payslips", { jobId: uni, month: "2026-01", gross: 1500000, net: 1200000, date: "2026-02-01", accountId: bank });
    expect(r.statusCode).toBe(201);
    janId = r.json().id;
    expect(r.json()).toMatchObject({ month: "2026-01", kind: "MONTHLY", gross: 1500000, net: 1200000, date: "2026-02-01", status: "PAID" });
    const feb = await incomeOf("2026-02");
    expect(feb.items).toHaveLength(1);
    expect(feb.items[0]).toMatchObject({ type: "INCOME", amount: 1200000, description: "Sueldo Facultad 2026-01" });
    expect(feb.summary.income).toBe(1200000);
    expect(await balance()).toBe(1200000);
    const cats = (await call("GET", "/api/categories")).json();
    expect(cats.find((c: any) => c.id === feb.items[0].categoryId)).toMatchObject({ name: "Sueldo", type: "INCOME" });
  });

  it("no permite repetir mes y tipo", async () => {
    const dup = await call("POST", "/api/payslips", { jobId: uni, month: "2026-01", gross: 1, net: 1, date: "2026-02-01", accountId: bank });
    expect(dup.statusCode).toBe(409);
  });

  it("valida montos y cuenta", async () => {
    expect((await call("POST", "/api/payslips", { jobId: uni, month: "2026-05", gross: 100, net: -1, date: "2026-06-01", accountId: bank })).statusCode).toBe(400);
    expect((await call("POST", "/api/payslips", { jobId: uni, month: "2026-05", gross: 100, net: 90, date: "2026-06-01", accountId: "nope" })).statusCode).toBe(400);
  });

  it("editar bruto/neto/fecha mantiene sincronizado el ingreso", async () => {
    const r = await call("PATCH", `/api/payslips/${janId}`, { net: 1300000, gross: 1600000, date: "2026-02-03" });
    expect(r.json()).toMatchObject({ gross: 1600000, net: 1300000, date: "2026-02-03" });
    expect((await incomeOf("2026-02")).items[0]).toMatchObject({ amount: 1300000, date: "2026-02-03" });
    expect(await balance()).toBe(1300000);
  });

  it("puede cargarse como pendiente: no suma al saldo hasta cobrarlo", async () => {
    await call("POST", "/api/payslips", { jobId: uni, month: "2026-02", gross: 1400000, net: 1100000, date: "2026-03-01", accountId: bank, paid: false });
    expect((await incomeOf("2026-03")).items[0].status).toBe("PENDING");
    expect(await balance()).toBe(1300000);
  });

  it("el historial viene ordenado del más nuevo al más viejo", async () => {
    await call("POST", "/api/payslips", { jobId: uni, month: "2026-03", gross: 1545966.04, net: 1250000, date: "2026-04-01", accountId: bank });
    const list = (await call("GET", "/api/payslips")).json();
    expect(list.map((p: any) => p.month)).toEqual(["2026-03", "2026-02", "2026-01"]);
  });
});

describe("SAC", () => {
  it("sugiere la mitad del mayor bruto del semestre", async () => {
    expect((await call("GET", `/api/payslips/sac-suggestion?month=2026-06&jobId=${uni}`)).json()).toEqual({ month: "2026-06", basedOnMonths: 3, suggested: 800000, basis: "gross" });
    expect((await call("GET", `/api/payslips/sac-suggestion?month=2026-12&jobId=${uni}`)).json()).toMatchObject({ basedOnMonths: 0, suggested: null });
  });

  it("el SAC va a su propia categoría y convive con el sueldo del mismo mes", async () => {
    const r = await call("POST", "/api/payslips", { jobId: uni, month: "2026-06", kind: "SAC", gross: 800000, net: 650000, date: "2026-06-30", accountId: bank });
    expect(r.statusCode).toBe(201);
    const cats = (await call("GET", "/api/categories")).json();
    const tx = (await incomeOf("2026-06")).items[0];
    expect(cats.find((c: any) => c.id === tx.categoryId).name).toBe("SAC");
    const sueldoJunio = await call("POST", "/api/payslips", { jobId: uni, month: "2026-06", gross: 1, net: 1, date: "2026-07-01", accountId: bank });
    expect(sueldoJunio.statusCode).toBe(201);
  });
});

describe("varios trabajos", () => {
  it("cada trabajo tiene su recibo del mes", async () => {
    const other = (await call("POST", "/api/jobs", { name: "Consultora" })).json().id;
    const r = await call("POST", "/api/payslips", { jobId: other, month: "2026-01", gross: 500000, net: 400000, date: "2026-02-05", accountId: bank });
    expect(r.statusCode).toBe(201);
    expect((await incomeOf("2026-02")).summary.income).toBe(1700000);
    const dup = await call("POST", "/api/payslips", { jobId: other, month: "2026-01", gross: 1, net: 1, date: "2026-02-05", accountId: bank });
    expect(dup.statusCode).toBe(409);
    expect((await call("POST", "/api/jobs", { name: "Consultora" })).statusCode).toBe(409);
  });

  it("un trabajo en negro solo lleva neto, aunque se mande bruto", async () => {
    cash = (await call("POST", "/api/accounts", { name: "Efectivo", kind: "CASH" })).json().id;
    bar = (await call("POST", "/api/jobs", { name: "Bar", informal: true, accountId: cash })).json().id;
    const r = await call("POST", "/api/payslips", { jobId: bar, month: "2026-01", net: 300000, date: "2026-01-31", accountId: cash });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ jobId: bar, gross: null, net: 300000 });
    const p = await call("PATCH", `/api/payslips/${r.json().id}`, { gross: 999, net: 320000 });
    expect(p.json()).toMatchObject({ gross: null, net: 320000 });
    const cashBal = (await call("GET", "/api/accounts")).json().find((a: any) => a.id === cash).balance;
    expect(cashBal).toBe(320000);
    await call("POST", "/api/payslips", { jobId: bar, month: "2026-02", net: 350000, date: "2026-02-28", accountId: cash });
    expect((await call("GET", `/api/payslips/sac-suggestion?month=2026-06&jobId=${bar}`)).json()).toMatchObject({ suggested: 175000, basis: "net", basedOnMonths: 2 });
  });

  it("un trabajo en blanco exige el bruto", async () => {
    const r = await call("POST", "/api/payslips", { jobId: uni, month: "2026-09", net: 1, date: "2026-10-01", accountId: bank });
    expect(r.statusCode).toBe(400);
  });

  it("renombrar el trabajo renombra sus ingresos; no se borra si tiene recibos", async () => {
    await call("PATCH", `/api/jobs/${bar}`, { name: "Bar de Juan" });
    expect((await incomeOf("2026-01")).items[0].description).toBe("Sueldo Bar de Juan 2026-01");
    expect((await call("DELETE", `/api/jobs/${bar}`)).statusCode).toBe(409);
    const jobs = (await call("GET", "/api/jobs")).json();
    expect(jobs.find((j: any) => j.id === bar)).toMatchObject({ informal: true, payslipCount: 2, accountId: cash });
  });
});

describe("baja", () => {
  it("borrar el recibo borra su ingreso", async () => {
    expect((await call("DELETE", `/api/payslips/${janId}`)).statusCode).toBe(204);
    expect((await incomeOf("2026-02")).items.map((t: any) => t.description)).not.toContain("Sueldo Facultad 2026-01");
    expect((await call("GET", "/api/payslips")).json().map((p: any) => p.id)).not.toContain(janId);
  });
});
