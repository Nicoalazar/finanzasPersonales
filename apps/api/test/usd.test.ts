import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authedApp, resetDb } from "./helpers.js";
import { prisma } from "../src/plugins/db.js";
import { parseQuote, resetFxCache } from "../src/modules/fx/service.js";

let call: Awaited<ReturnType<typeof authedApp>>["call"];
let app: Awaited<ReturnType<typeof authedApp>>["app"];
let visa: string, master: string, camila: string, bank: string, viajes: string;

const quote = (venta: unknown = 1230.5) => ({ moneda: "USD", casa: "oficial", compra: 1180, venta, fechaActualizacion: "2026-03-10T15:00:00.000Z" });
const apiUp = (body: unknown = quote()) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
const apiDown = () => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));

beforeAll(async () => {
  await resetDb();
  ({ app, call } = await authedApp());
  visa = (await call("POST", "/api/cards", { name: "Visa", closingDay: 25, dueDay: 5 })).json().id;
  master = (await call("POST", "/api/cards", { name: "Master", closingDay: 25, dueDay: 5 })).json().id;
  camila = (await call("POST", "/api/persons", { name: "Camila" })).json().id;
  bank = (await call("POST", "/api/accounts", { name: "Banco" })).json().id;
  viajes = (await call("POST", "/api/categories", { name: "Viajes", type: "EXPENSE" })).json().id;
});
beforeEach(() => resetFxCache());
afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
  await prisma.$disconnect();
});

const buy = (body: object) => call("POST", "/api/card-purchases", { cardId: visa, date: "2026-03-10", description: "x", totalAmount: 50, ...body });
const statement = async (month = "2026-03", card = visa) => (await call("GET", `/api/cards/${card}/statement?month=${month}`)).json();

describe("cotización sugerida", () => {
  it("toma la punta vendedora del dólar oficial", async () => {
    apiUp();
    expect((await call("GET", `/api/fx/usd?cardId=${visa}`)).json()).toEqual({ rate: 1230.5, source: "api", asOf: "2026-03-10T15:00:00.000Z" });
  });

  it("cachea: no vuelve a pedirla en cada carga", async () => {
    apiUp();
    await call("GET", `/api/fx/usd?cardId=${visa}`);
    await call("GET", `/api/fx/usd?cardId=${visa}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("si la API cae y no hay resumen con cotización, no inventa: devuelve null", async () => {
    apiDown();
    expect((await call("GET", `/api/fx/usd?cardId=${visa}`)).json()).toEqual({ rate: null, source: null, asOf: null });
  });

  it("entiende la respuesta real de DolarApi (dolares/oficial)", () => {
    const real = { moneda: "USD", casa: "oficial", nombre: "Oficial", compra: 1520, venta: 1570, fechaActualizacion: "2026-11-05T18:00:00.000Z" };
    expect(parseQuote(real)).toEqual({ rate: 1570, updatedAt: "2026-11-05T18:00:00.000Z" });
  });

  it("descarta respuestas que no sirven", () => {
    expect(parseQuote(quote("abc"))).toBeNull();
    expect(parseQuote(quote(0))).toBeNull();
    expect(parseQuote(quote(-5))).toBeNull();
    expect(parseQuote(null)).toBeNull();
    expect(parseQuote({ error: "x" })).toBeNull();
    expect(parseQuote(quote(1230.123456))?.rate).toBe(1230.1235);
  });
});

describe("cargar compras en USD", () => {
  it("rechaza cuotas y repartos que no sean un tercero al 100%", async () => {
    expect((await buy({ currency: "USD", usdRateEstimate: 1200, installmentCount: 3 })).statusCode).toBe(400);
    expect((await buy({ currency: "USD", usdRateEstimate: 1200, shares: [{ personId: camila, mode: "PERCENT", value: 50 }] })).statusCode).toBe(400);
    expect((await buy({ currency: "USD", usdRateEstimate: 1200, shares: [{ personId: camila, mode: "AMOUNT", value: 100 }] })).statusCode).toBe(400);
  });

  it("sin cotización informada, la API cae y la tarjeta nunca tuvo una real: pide cargarla a mano", async () => {
    apiDown();
    const r = await buy({ cardId: master, currency: "USD" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/a mano/);
    expect(await prisma.cardPurchase.count({ where: { cardId: master } })).toBe(0);
  });

  it("sin cotización informada usa la de la API", async () => {
    apiUp();
    expect((await buy({ cardId: master, currency: "USD", description: "Spotify" })).statusCode).toBe(201);
    const [p] = (await call("GET", `/api/card-purchases?cardId=${master}`)).json();
    expect(p).toMatchObject({ currency: "USD", totalAmount: 50, usdRateEstimate: 1230.5, installmentCount: 1 });
  });

  it("en compras en pesos ignora la cotización", async () => {
    expect((await buy({ cardId: master, description: "Pesos", usdRateEstimate: 5 })).statusCode).toBe(201);
    const p = (await call("GET", `/api/card-purchases?cardId=${master}`)).json().find((x: any) => x.description === "Pesos");
    expect(p).toMatchObject({ currency: "ARS", usdRateEstimate: null });
  });
});

describe("resumen con consumos USD", () => {
  beforeAll(async () => {
    await buy({ description: "Sillas", totalAmount: 10000 });
    await buy({ description: "Hotel", totalAmount: 50, currency: "USD", usdRateEstimate: 1200, categoryId: viajes });
    await buy({ description: "Curso", totalAmount: 100, currency: "USD", usdRateEstimate: 1200, shares: [{ personId: camila, mode: "PERCENT", value: 100 }] });
  });

  it("mientras no hay cotización real convierte con la estimada y lo marca", async () => {
    const st = await statement();
    expect(st).toMatchObject({
      subtotal: 10000, stampTax: 70, arsTotal: 10070, total: 190070, thirdParty: 120000, netOwn: 70070, usdEffectiveRate: 1200,
      usdSubtotal: 150, usdSubtotalArs: 180000, usdRate: null, usdEstimated: true,
    });
    const hotel = st.items.find((i: any) => i.description === "Hotel");
    expect(hotel).toMatchObject({ amount: 60000, usdAmount: 50, rate: 1200 });
    expect(st.items.find((i: any) => i.description === "Sillas")).toMatchObject({ amount: 10000, usdAmount: null, rate: null });
    expect(st.byPerson).toEqual([{ personId: camila, name: "Camila", amount: 120000 }]);
  });

  it("presupuestos y personas usan los pesos, no los dólares", async () => {
    const b = (await call("GET", "/api/budgets?month=2026-03")).json();
    expect(b.rows.find((r: any) => r.categoryId === viajes).spent).toBe(60000);
    // Personas imputa al mes en que vence el resumen: el de marzo (cierre 25, vence el 5) cuenta en abril
    expect((await call("GET", "/api/persons/summary?asOf=2026-03")).json()[0].accrued).toBe(0);
    const [sum] = (await call("GET", "/api/persons/summary?asOf=2026-04")).json();
    expect(sum.accrued).toBe(120000);
    const detail = (await call("GET", `/api/persons/${camila}?asOf=2026-04`)).json();
    expect(detail.months[0].month).toBe("2026-04");
    expect(detail.months[0].lines[0]).toMatchObject({ kind: "CARD", amount: 120000, estimated: true });
  });

  it("no deja pagar sin la cotización real", async () => {
    const r = await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-04-05", accountId: bank });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/cotización/);
    expect((await statement()).paidAt).toBeNull();
  });

  it("la cotización real reemplaza a las estimadas y recalcula todo", async () => {
    const st = (await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", usdRate: 1250, adjustment: 54000 })).json();
    // pesos: 10.000 + sellos 7‰ (solo sobre los pesos) 70 + percepción 54.000 en Ajuste = 64.070; + USD 150×1250 = 187.500
    expect(st).toMatchObject({
      subtotal: 10000, stampTax: 70, adjustment: 54000, arsTotal: 64070, total: 251570, usdEffectiveRate: 1250,
      usdSubtotal: 150, usdSubtotalArs: 187500, usdRate: 1250, usdEstimated: false,
    });
    expect(st.items.find((i: any) => i.description === "Hotel")).toMatchObject({ amount: 62500, rate: 1250 });
  });

  it("el tercero debe USD × cotización; la percepción la absorbés vos", async () => {
    const st = await statement();
    expect(st.thirdParty).toBe(125000);
    expect(st.byPerson).toEqual([{ personId: camila, name: "Camila", amount: 125000 }]);
    // netOwn = total − terceros: incluye los 54.000 de percepción, que no están en ninguna categoría
    expect(st.netOwn).toBe(126570);
    const [sum] = (await call("GET", "/api/persons/summary?asOf=2026-04")).json();
    expect(sum.accrued).toBe(125000);
    const detail = (await call("GET", `/api/persons/${camila}?asOf=2026-04`)).json();
    expect(detail.months[0].lines[0].amount).toBe(125000);
    expect(detail.months[0].lines[0].estimated).toBeUndefined();
  });

  it("presupuestos con la cotización real", async () => {
    const b = (await call("GET", "/api/budgets?month=2026-03")).json();
    expect(b.rows.find((r: any) => r.categoryId === viajes).spent).toBe(62500);
    // el curso es 100% de Camila: no suma a ninguna categoría mía. Sin categoría quedan Sillas (10.000),
    // el Spotify de Master (USD 50 a la estimada 1230,5 = 61.525, ese resumen no tiene cotización real) y 50 en pesos.
    expect(b.rows.find((r: any) => r.categoryId === null).spent).toBe(71575);
  });

  it("si la API cae, la última cotización real del resumen sirve de estimación", async () => {
    apiDown();
    expect((await call("GET", `/api/fx/usd?cardId=${visa}`)).json()).toEqual({ rate: 1250, source: "statement", asOf: "2026-03" });
    expect((await buy({ description: "Sin API", currency: "USD", date: "2026-04-01" })).statusCode).toBe(201);
    const p = (await call("GET", `/api/card-purchases?cardId=${visa}`)).json().find((x: any) => x.description === "Sin API");
    expect(p.usdRateEstimate).toBe(1250);
  });

  it("al pagar sale un solo movimiento en pesos y quedan bloqueados cotización y ajuste", async () => {
    const pay = await call("POST", `/api/cards/${visa}/statement/pay`, { month: "2026-03", date: "2026-04-05", accountId: bank });
    expect(pay.statusCode).toBe(200);
    expect((await call("GET", "/api/accounts")).json()[0].balance).toBe(-251570);
    expect((await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", usdRate: 1300 })).statusCode).toBe(409);
    expect((await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", adjustment: 1 })).statusCode).toBe(409);
    expect((await statement()).total).toBe(251570);
    // deshacer el pago libera la edición
    await call("DELETE", `/api/cards/${visa}/statement/pay?month=2026-03`);
    expect((await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", usdRate: 1300 })).statusCode).toBe(200);
  });

  it("la cotización real se puede borrar y vuelve la estimación", async () => {
    const st = (await call("PATCH", `/api/cards/${visa}/statement`, { month: "2026-03", usdRate: null })).json();
    expect(st).toMatchObject({ usdRate: null, usdEstimated: true, usdSubtotalArs: 180000 });
  });

  it("los compromisos futuros usan el neto con los dólares convertidos", async () => {
    // 10.000 + 70 de sellos + 54.000 de Ajuste + 180.000 en USD (estimados) − 120.000 del tercero
    const [m] = (await call("GET", "/api/cards/commitments?from=2026-03&months=1")).json();
    expect(m.byCard.find((c: any) => c.cardId === visa).total).toBe(124070);
  });
});

describe("resúmenes sin dólares", () => {
  it("quedan igual: sin campos USD activos y se pagan sin pedir cotización", async () => {
    const st = await statement("2026-03", master);
    expect(st).toMatchObject({ usdSubtotal: 50, usdEstimated: true });
    const noUsd = await statement("2027-01", master);
    expect(noUsd).toMatchObject({ usdSubtotal: 0, usdSubtotalArs: 0, usdRate: null, usdEstimated: false, items: [] });
  });
});
