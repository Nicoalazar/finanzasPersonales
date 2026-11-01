import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let visa: string;

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const firstMonth = async (date: string) => (await call("GET", `/api/cards/${visa}/first-month?date=${date}`)).json().month;

describe("cierre y vencimiento por mes", () => {
  it("usa los días de la tarjeta por defecto", async () => {
    const st = (await call("GET", `/api/cards/${visa}/statement?month=2026-03`)).json();
    expect(st).toMatchObject({ closingDate: "2026-03-25", dueDate: "2026-04-05", closingIsCustom: false, dueIsCustom: false });
    expect(await firstMonth("2026-03-28")).toBe("2026-04");
  });

  it("editar el cierre de un mes cambia a qué resumen va una compra nueva", async () => {
    const st = (await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", closingDate: "2026-03-30", dueDate: "2026-04-08" })).json();
    expect(st).toMatchObject({ closingDate: "2026-03-30", dueDate: "2026-04-08", closingIsCustom: true, dueIsCustom: true });
    expect(await firstMonth("2026-03-28")).toBe("2026-03");
    expect(await firstMonth("2026-03-31")).toBe("2026-04");
    const r = await call("POST", "/api/card-purchases", { cardId: visa, date: "2026-03-28", description: "Tarde", totalAmount: 100 });
    expect(r.json().firstStatementMonth).toBe("2026-03");
  });

  it("null vuelve al día por defecto sin tocar otros meses", async () => {
    const st = (await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", closingDate: null })).json();
    expect(st).toMatchObject({ closingDate: "2026-03-25", closingIsCustom: false, dueDate: "2026-04-08" });
    expect(await firstMonth("2026-04-28")).toBe("2026-05");
  });

  it("mover una compra de mes desplaza todas sus cuotas", async () => {
    const created = (await call("POST", "/api/card-purchases", { cardId: visa, date: "2026-06-01", description: "Cuotas", totalAmount: 300, installmentCount: 3 })).json();
    expect(created).toMatchObject({ firstStatementMonth: "2026-06", lastStatementMonth: "2026-08" });
    const moved = (await call("PATCH", `/api/card-purchases/${created.id}`, { firstStatementMonth: "2026-07" })).json();
    expect(moved.lastStatementMonth).toBe("2026-09");
    const june = (await call("GET", `/api/cards/${visa}/statement?month=2026-06`)).json();
    const sept = (await call("GET", `/api/cards/${visa}/statement?month=2026-09`)).json();
    expect(june.items).toHaveLength(0);
    expect(sept.items[0]).toMatchObject({ number: 3, count: 3 });
  });
});
