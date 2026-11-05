import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let bank: string, alquiler: string, hogar: string, visa: string;

const HEADER = "Marca temporal,Pagado por:,Elija el tipo:,Monto,Elija el Servicio,Monto del Servicio,Monto de la Compra,Concepto,Monto Pagado,Detalle de Gasto,Monto del Gasto";
const ROWS = [
  '28/02/2026 10:00:00,Nico,Mercadería,,,,"5000",,,,',
  '2/03/2026 19:50:35,Nico,Mercadería,,,,"90000",,,,',
  "4/03/2026 19:49:11,Euge,Alquiler,,,,,Alquiler,110000,,",
  '6/03/2026 18:00:00,Euge,Varios,,,,,,,Ollas,"20000"',
];
const csv = (rows = ROWS) => [HEADER, ...rows].join("\n");
const month = async (m = "2026-03") => (await call("GET", `/api/shared/month?month=${m}`)).json();
const spent = async (id: string, m = "2026-03") => (await call("GET", `/api/budgets?month=${m}`)).json().rows.find((r: any) => r.categoryId === id)?.spent;

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  alquiler = (await call("POST", "/api/categories", { name: "Alquiler", type: "EXPENSE" })).json().id;
  hogar = (await call("POST", "/api/shared-groups", { name: "Hogar", myPercent: 35 })).json().id;
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("gastos compartidos", () => {
  it("la configuración arranca con el grupo Hogar y se edita", async () => {
    expect((await call("GET", "/api/shared/config")).json()).toMatchObject({ groupId: hogar, sourceUrl: null });
    const res = await call("PATCH", "/api/shared/config", { meName: "Nico", partnerName: "Euge", fromMonth: "2026-03", defaultAccountId: bank });
    expect(res.json()).toMatchObject({ meName: "Nico", partnerName: "Euge", fromMonth: "2026-03", defaultAccountId: bank });
    expect((await call("POST", "/api/shared/import", {})).statusCode).toBe(400); // sin link ni archivo
  });

  it("importa desde el mes configurado, mapea categorías y genera solo mis pagos", async () => {
    const r = (await call("POST", "/api/shared/import", { csv: csv() })).json();
    expect(r).toMatchObject({ created: 3, removed: 0, unchanged: 0, skippedBefore: 1, errors: [] });

    const m = await month();
    expect(m).toMatchObject({ percent: 35, total: 220000, myShare: 77000, partnerShare: 143000, paidByMe: 90000, paidByPartner: 130000, balance: 13000, pending: 13000 });
    expect(m.byKind.find((k: any) => k.kind === "Alquiler")).toMatchObject({ categoryId: alquiler, total: 110000, myShare: 38500 });
    const merca = m.byKind.find((k: any) => k.kind === "Mercadería");
    expect(merca.categoryId).toBeTruthy(); // la creó

    const txs = (await call("GET", "/api/transactions?month=2026-03")).json();
    expect(txs.items).toHaveLength(1);
    expect(txs.items[0]).toMatchObject({ amount: 90000, accountId: bank, categoryId: merca.categoryId });
    expect(txs.summary.expense).toBe(90000);
  });

  it("en categorías cuenta mi parte, no lo que pagué", async () => {
    const m = await month();
    const merca = m.byKind.find((k: any) => k.kind === "Mercadería").categoryId;
    expect(await spent(merca)).toBe(31500);
    expect(await spent(alquiler)).toBe(38500);
  });

  it("reimportar no duplica y saca lo que se borró de la planilla", async () => {
    expect((await call("POST", "/api/shared/import", { csv: csv() })).json()).toMatchObject({ created: 0, unchanged: 3 });
    const r = (await call("POST", "/api/shared/import", { csv: csv(ROWS.slice(0, 3)) })).json();
    expect(r).toMatchObject({ created: 0, removed: 1, unchanged: 2 });
    expect((await month()).total).toBe(200000);
    expect((await call("POST", "/api/shared/import", { csv: csv() })).json()).toMatchObject({ created: 1 });
  });

  it("el % del mes se edita y recalcula el saldo", async () => {
    await call("PUT", `/api/shared-groups/${hogar}/percent`, { month: "2026-03", percent: 50 });
    expect(await month()).toMatchObject({ percent: 50, percentIsOwn: true, myShare: 110000, balance: -20000 });
    await call("DELETE", `/api/shared-groups/${hogar}/percent/2026-03`);
    expect((await month()).percent).toBe(35);
  });

  it("registrar el saldo: lo que me pagan es reintegro y el gasto neto queda en mi parte", async () => {
    const res = await call("POST", "/api/shared/settle", { month: "2026-03", date: "2026-04-02", accountId: bank, amount: 13000 });
    expect(res.statusCode).toBe(201);
    expect(await month()).toMatchObject({ settled: 13000, pending: 0 });
    const apr = (await call("GET", "/api/transactions?month=2026-04")).json();
    expect(apr.summary).toMatchObject({ reimbursements: 13000, income: 0 });
    expect(apr.items[0].sharedMonth).toBe("2026-03");
    await call("DELETE", `/api/shared/settlements/${res.json().transactionId}`);
    expect((await month()).pending).toBe(13000);
  });

  it("mi pago no se edita desde Mes, y con tarjeta pasa a una compra en cuotas", async () => {
    const entry = (await month()).entries.find((e: any) => e.payer === "ME");
    const tx = (await call("GET", "/api/transactions?month=2026-03")).json().items[0];
    expect((await call("DELETE", `/api/transactions/${tx.id}`)).statusCode).toBe(409);

    await call("PATCH", `/api/shared/entries/${entry.id}`, { cardId: visa, installmentCount: 3 });
    expect((await call("GET", "/api/transactions?month=2026-03")).json().items).toHaveLength(0);
    const purchases = (await call("GET", `/api/card-purchases?cardId=${visa}`)).json();
    expect(purchases[0]).toMatchObject({ totalAmount: 90000, installmentCount: 3, firstStatementMonth: "2026-03", shared: true });
    expect((await call("DELETE", `/api/card-purchases/${purchases[0].id}`)).statusCode).toBe(409);
    // la cuota de tarjeta no suma a categorías: sigue contando mi parte
    const merca = (await month()).byKind.find((k: any) => k.kind === "Mercadería").categoryId;
    expect(await spent(merca)).toBe(31500);

    await call("PATCH", `/api/shared/entries/${entry.id}`, { accountId: bank });
    expect((await call("GET", `/api/card-purchases?cardId=${visa}`)).json()).toHaveLength(0);
    expect((await call("GET", "/api/transactions?month=2026-03")).json().items).toHaveLength(1);
  });

  it("cambiar la categoría de un tipo se aplica a lo generado", async () => {
    await call("PUT", "/api/shared/kinds", { kind: "Mercadería", categoryId: alquiler });
    expect((await call("GET", "/api/transactions?month=2026-03")).json().items[0].categoryId).toBe(alquiler);
    expect(await spent(alquiler)).toBe(70000);
  });

  it("borrar un gasto del formulario lo ignora y no vuelve al reimportar", async () => {
    const entry = (await month()).entries.find((e: any) => e.payer === "ME");
    await call("DELETE", `/api/shared/entries/${entry.id}`);
    expect((await call("GET", "/api/transactions?month=2026-03")).json().items).toHaveLength(0);
    expect((await call("POST", "/api/shared/import", { csv: csv() })).json()).toMatchObject({ created: 0 });
    expect((await month()).total).toBe(130000);
  });

  it("carga manual y aviso de recurrentes del mismo grupo", async () => {
    const res = await call("POST", "/api/shared/entries", { date: "2026-03-15", payer: "PARTNER", kind: "Streaming", description: "Netflix", amount: 5000 });
    expect(res.statusCode).toBe(201);
    expect((await month()).total).toBe(135000);
    await call("POST", "/api/recurring", { name: "Expensas", amount: 30000, startMonth: "2026-01", accountId: bank, sharedGroupId: hogar });
    const m = await month();
    expect(m.overlappingRecurring).toEqual(["Expensas"]);
    // el recurrente del grupo suma al total y a las partes, sin tocar el saldo
    expect(m.recurring).toMatchObject([{ name: "Expensas", total: 30000 }]);
    expect(m.total).toBe(165000);
    expect(m.paidByMe + m.paidByPartner).toBe(m.total);
  });
});
