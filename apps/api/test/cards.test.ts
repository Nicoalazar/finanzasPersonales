import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let visa: string, camila: string, bank: string;

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
  camila = (await call("POST", "/api/persons", { name: "Camila" })).json().id;
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("compras en cuotas", () => {
  it("genera cuotas con redondeo y mes según el cierre", async () => {
    const r = await call("POST", "/api/card-purchases", {
      cardId: visa, date: "2026-03-20", description: "Sillas", totalAmount: 20000, installmentCount: 3,
      shares: [{ personId: camila, mode: "PERCENT", value: 50 }],
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ firstStatementMonth: "2026-03", lastStatementMonth: "2026-05" });
    // 28/03 pasó el cierre (25) → cae en el resumen de abril
    const r2 = await call("POST", "/api/card-purchases", { cardId: visa, date: "2026-03-28", description: "Varios", totalAmount: 1000 });
    expect(r2.json().firstStatementMonth).toBe("2026-04");
    const rows = await prisma.cardInstallment.findMany({ where: { purchase: { description: "Sillas" } }, orderBy: { number: "asc" } });
    expect(rows.map((x) => Number(x.amount))).toEqual([6666.67, 6666.67, 6666.66]);
  });

  it("rechaza repartos inválidos", async () => {
    const bad = await call("POST", "/api/card-purchases", {
      cardId: visa, date: "2026-03-20", description: "X", totalAmount: 100,
      shares: [{ personId: camila, mode: "PERCENT", value: 120 }],
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("resumen", () => {
  it("calcula 7‰, terceros y neto propio", async () => {
    const st = (await call("GET", `/api/cards/${visa}/statement?month=2026-03`)).json();
    expect(st).toMatchObject({ subtotal: 6666.67, stampTax: 46.67, total: 6713.34, thirdParty: 3333.34, netOwn: 3380, paidAt: null });
    expect(st.items).toHaveLength(1);
    expect(st.items[0]).toMatchObject({ number: 1, count: 3, description: "Sillas" });
    expect(st.byPerson).toEqual([{ personId: camila, name: "Camila", amount: 3333.34 }]);
  });

  it("aplica ajuste y reintegros", async () => {
    const st = (await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", adjustment: 100, refunds: 50 })).json();
    expect(st).toMatchObject({ total: 6813.34, refunds: 50, netOwn: 3430 });
  });

  it("paga el resumen una sola vez y se puede revertir", async () => {
    const pay = await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-04-05", accountId: bank });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().paidAt).toBe("2026-04-05");
    expect((await call("GET", "/api/accounts")).json()[0].balance).toBe(-6813.34);
    expect((await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-04-05", accountId: bank })).statusCode).toBe(409);
    expect((await call("DELETE", `/api/cards/${visa}/statement/pay?month=2026-03`)).json().paidAt).toBeNull();
    expect((await call("GET", "/api/accounts")).json()[0].balance).toBe(0);
  });
});

describe("compromisos", () => {
  it("proyecta el total por mes con impuesto", async () => {
    const r = (await call("GET", "/api/cards/commitments?from=2026-03&months=4")).json();
    expect(r.map((m: any) => [m.month, m.total])).toEqual([["2026-03", 6713.34], ["2026-04", 7720.34], ["2026-05", 6713.33], ["2026-06", 0]]);
  });

  it("borrar una compra elimina sus cuotas", async () => {
    const [p] = (await call("GET", `/api/card-purchases?cardId=${visa}`)).json().filter((x: any) => x.description === "Sillas");
    expect((await call("DELETE", `/api/card-purchases/${p.id}`)).statusCode).toBe(204);
    const st = (await call("GET", `/api/cards/${visa}/statement?month=2026-03`)).json();
    expect(st.items).toHaveLength(0);
    expect(st.subtotal).toBe(0);
  });
});
