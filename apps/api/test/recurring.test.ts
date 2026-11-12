import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, cat: string, hogar: string, guille: string, alquiler: string, patente: string, youtube: string;

const gen = async (month: string) => (await call("POST", "/api/recurring/generate", { month })).json();
const month = async (m: string) => (await call("GET", `/api/transactions?month=${m}`)).json().items as any[];
const byDesc = (items: any[], d: string) => items.find((t) => t.description === d);

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  cat = (await call("POST", "/api/categories", { name: "Servicios", type: "EXPENSE" })).json().id;
  hogar = (await call("POST", "/api/shared-groups", { name: "Hogar", myPercent: 35 })).json().id;
  guille = (await call("POST", "/api/persons", { name: "Guille" })).json().id;
  const base = { categoryId: cat, accountId: bank, startMonth: "2026-01" };
  alquiler = (await call("POST", "/api/recurring", { ...base, name: "Alquiler", amount: 100000, sharedGroupId: hogar, dayOfMonth: 5 })).json().id;
  patente = (await call("POST", "/api/recurring", { ...base, name: "Patente", amount: 23000, frequency: "BIMONTHLY" })).json().id;
  youtube = (await call("POST", "/api/recurring", { ...base, name: "YouTube", amount: 8000 })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("generación del mes", () => {
  it("crea los pendientes que corresponden y es idempotente", async () => {
    expect(await gen("2026-02")).toEqual({ created: 2, updated: 0 }); // la patente es bimestral: no toca en febrero
    expect(await gen("2026-03")).toEqual({ created: 3, updated: 0 });
    expect(await gen("2026-03")).toEqual({ created: 0, updated: 0 });
    const items = await month("2026-03");
    expect(items.map((t) => [t.description, t.amount, t.status, t.date]).sort()).toEqual([
      ["Alquiler", 35000, "PENDING", "2026-03-05"], ["Patente", 23000, "PENDING", "2026-03-01"], ["YouTube", 8000, "PENDING", "2026-03-01"],
    ]);
  });

  it("exige cuenta y categoría de gastos", async () => {
    const noAcc = await call("POST", "/api/recurring", { name: "X", startMonth: "2026-01", amount: 5 });
    expect(noAcc.statusCode).toBe(400);
    const income = (await call("POST", "/api/categories", { name: "Sueldo", type: "INCOME" })).json().id;
    expect((await call("POST", "/api/recurring", { name: "X", startMonth: "2026-01", amount: 5, accountId: bank, categoryId: income })).statusCode).toBe(400);
  });
});

describe("porcentaje del grupo mes a mes", () => {
  it("cambiar el % de un mes actualiza los pendientes de ese mes y se hereda", async () => {
    expect((await call("PUT", `/api/shared-groups/${hogar}/percent`, { month: "2026-03", percent: 40 })).statusCode).toBe(200);
    expect(await gen("2026-03")).toEqual({ created: 0, updated: 1 });
    expect(byDesc(await month("2026-03"), "Alquiler").amount).toBe(40000);

    await gen("2026-04");
    expect(byDesc(await month("2026-04"), "Alquiler").amount).toBe(40000); // hereda marzo
    const g = (await call("GET", "/api/shared-groups?month=2026-04")).json()[0];
    expect(g).toMatchObject({ percent: 40, percentIsOwn: false, myPercent: 35 });
    expect((await call("GET", "/api/shared-groups?month=2026-02")).json()[0]).toMatchObject({ percent: 35 });
  });

  it("quitar el % propio vuelve al anterior", async () => {
    await call("PUT", `/api/shared-groups/${hogar}/percent`, { month: "2026-04", percent: 30 });
    await gen("2026-04");
    expect(byDesc(await month("2026-04"), "Alquiler").amount).toBe(30000);
    await call("DELETE", `/api/shared-groups/${hogar}/percent/2026-04`);
    await gen("2026-04");
    expect(byDesc(await month("2026-04"), "Alquiler").amount).toBe(40000);
  });

  it("valida el porcentaje", async () => {
    expect((await call("PUT", `/api/shared-groups/${hogar}/percent`, { month: "2026-05", percent: 120 })).statusCode).toBe(400);
  });
});

describe("precios", () => {
  it("un aumento rige desde su mes y no toca los anteriores", async () => {
    await call("PUT", `/api/recurring/${alquiler}/prices`, { fromMonth: "2026-04", amount: 110000 });
    await gen("2026-04");
    expect(byDesc(await month("2026-04"), "Alquiler").amount).toBe(44000);
    await gen("2026-03");
    expect(byDesc(await month("2026-03"), "Alquiler").amount).toBe(40000);
    const list = (await call("GET", "/api/recurring?month=2026-04")).json();
    expect(list.find((r: any) => r.id === alquiler)).toMatchObject({ price: 110000, groupPercent: 40, myAmount: 44000 });
  });

  it("no deja borrar el último precio", async () => {
    expect((await call("DELETE", `/api/recurring/${patente}/prices/2026-01`)).statusCode).toBe(409);
  });
});

describe("protecciones", () => {
  it("los pagados no se tocan", async () => {
    const t = byDesc(await month("2026-03"), "Alquiler");
    await call("PATCH", `/api/transactions/${t.id}`, { status: "PAID" });
    await call("PUT", `/api/shared-groups/${hogar}/percent`, { month: "2026-03", percent: 50 });
    expect(await gen("2026-03")).toEqual({ created: 0, updated: 0 });
    expect(byDesc(await month("2026-03"), "Alquiler").amount).toBe(40000);
  });

  it("un monto editado a mano queda fijo", async () => {
    const t = byDesc(await month("2026-03"), "Patente");
    await call("PATCH", `/api/transactions/${t.id}`, { amount: 25000 });
    await call("PUT", `/api/recurring/${patente}/prices`, { fromMonth: "2026-03", amount: 99999 });
    await gen("2026-03");
    expect(byDesc(await month("2026-03"), "Patente").amount).toBe(25000);
  });

  it("cambiar la cuenta mueve los pendientes (aun editados) y no los pagados", async () => {
    const other = (await call("POST", "/api/accounts", { name: "Billetera" })).json().id;
    expect((await call("PATCH", `/api/recurring/${patente}`, { accountId: other })).statusCode).toBe(200);
    expect((await call("PATCH", `/api/recurring/${alquiler}`, { accountId: other })).statusCode).toBe(200);
    const items = await month("2026-03");
    expect(byDesc(items, "Patente")).toMatchObject({ accountId: other, amount: 25000 });
    expect(byDesc(items, "Alquiler")).toMatchObject({ accountId: bank, status: "PAID" });
    expect((await call("GET", "/api/recurring")).json().find((r: any) => r.id === patente).accountId).toBe(other);
    expect((await call("PATCH", `/api/recurring/${patente}`, { accountId: "nope" })).statusCode).toBe(400);
  });

  it("borrar un pendiente saltea ese mes", async () => {
    const t = byDesc(await month("2026-03"), "YouTube");
    expect((await call("DELETE", `/api/transactions/${t.id}`)).statusCode).toBe(204);
    expect(await gen("2026-03")).toEqual({ created: 0, updated: 0 });
    expect(byDesc(await month("2026-03"), "YouTube")).toBeUndefined();
  });
});

describe("grupo con persona asignada", () => {
  it("pago el total y la persona debe lo que no es mi %, en Personas si el grupo no es el de Compartidos", async () => {
    expect((await call("GET", "/api/shared/config")).json().groupId).toBe(hogar); // el ledger se fija en Hogar
    const viajes = (await call("POST", "/api/shared-groups", { name: "Viajes", myPercent: 40, personId: guille })).json();
    expect(viajes).toMatchObject({ name: "Viajes", personId: guille });
    expect((await call("POST", "/api/shared-groups", { name: "X", myPercent: 40, personId: "nope" })).statusCode).toBe(400);
    const id = (await call("POST", "/api/recurring", { name: "Hotel", amount: 10000, startMonth: "2027-01", accountId: bank, categoryId: cat, sharedGroupId: viajes.id })).json().id;
    // sale de mi cuenta el total; la persona debe el 60%
    const spentIn = async (m: string) => (await call("GET", `/api/budgets?month=${m}`)).json().rows.find((x: any) => x.categoryId === cat)?.spent ?? 0;
    const spentBefore = await spentIn("2027-01");
    await gen("2027-01");
    expect(byDesc(await month("2027-01"), "Hotel")).toMatchObject({ amount: 10000 });
    const r = (await call("GET", "/api/recurring?month=2027-01")).json().find((x: any) => x.id === id);
    expect(r).toMatchObject({ myAmount: 10000, owedAmount: 6000, groupPercent: 40 });
    const s = (await call("GET", "/api/persons/summary?asOf=2027-01")).json().find((p: any) => p.personId === guille);
    expect(s).toMatchObject({ accrued: 6000, balance: 6000 });
    const d = (await call("GET", `/api/persons/${guille}?asOf=2027-01`)).json();
    expect(d.months[0].lines[0]).toMatchObject({ kind: "RECURRING", description: "Hotel", amount: 6000 });
    // en categorías cuenta solo mi parte (40 % = 4000), no lo que Guille me debe
    expect(await spentIn("2027-01")).toBe(spentBefore + 4000);
    // un mes salteado no se le cobra
    await call("DELETE", `/api/transactions/${byDesc(await month("2027-01"), "Hotel").id}`);
    const months = (await call("GET", `/api/persons/${guille}?asOf=2027-01`)).json().months.map((m: any) => m.month);
    expect(months).not.toContain("2027-01");
    expect(months).toContain("2027-02");
  });

  it("el grupo de Compartidos no suma en Personas aunque tenga persona", async () => {
    expect((await call("PATCH", `/api/shared-groups/${hogar}`, { personId: guille })).statusCode).toBe(200);
    const d = (await call("GET", `/api/persons/${guille}?asOf=2027-01`)).json();
    expect(d.months.flatMap((m: any) => m.lines.map((l: any) => l.description))).not.toContain("Alquiler");
  });
});

describe("baja", () => {
  it("eliminar un recurrente borra sus pendientes y conserva los pagados", async () => {
    expect((await call("DELETE", `/api/recurring/${alquiler}`)).statusCode).toBe(204);
    expect(byDesc(await month("2026-03"), "Alquiler")).toMatchObject({ status: "PAID" });
    expect(byDesc(await month("2026-04"), "Alquiler")).toBeUndefined();
    expect((await call("GET", "/api/recurring")).json().map((r: any) => r.id)).not.toContain(alquiler);
  });
});
