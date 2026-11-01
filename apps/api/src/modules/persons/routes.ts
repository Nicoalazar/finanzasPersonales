import type { FastifyInstance } from "fastify";
import {
  asOfQuery, fromCents, personChargeInput, personInput, personPaymentInput, toCents,
  type PersonDetailDto, type PersonDto, type PersonMonthDto, type PersonSummaryDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { fromDbDate, num, parse, toDbDate } from "../../lib.js";
import { accruals, personsSummary, reimbursementCategoryId } from "./service.js";

const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);

export async function personRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/persons", async (): Promise<PersonDto[]> => {
    const rows = await prisma.person.findMany({ orderBy: { name: "asc" } });
    return rows.map((p) => ({ id: p.id, name: p.name }));
  });

  app.post("/api/persons", async (req, reply) => {
    const body = parse(personInput, req.body, reply);
    if (!body) return;
    if (await prisma.person.findUnique({ where: { name: body.name } })) return reply.code(409).send({ error: "Ya existe esa persona" });
    const p = await prisma.person.create({ data: body });
    return reply.code(201).send({ id: p.id, name: p.name } satisfies PersonDto);
  });

  /** Saldo de cada persona al mes `asOf` (por defecto el actual): devengado − pagos. */
  app.get("/api/persons/summary", async (req, reply) => {
    const q = parse(asOfQuery, req.query, reply);
    if (!q) return;
    return personsSummary(q.asOf ?? currentMonth());
  });

  app.get<{ Params: { id: string } }>("/api/persons/:id", async (req, reply) => {
    const q = parse(asOfQuery, req.query, reply);
    if (!q) return;
    const person = await prisma.person.findUnique({ where: { id: req.params.id } });
    if (!person) return reply.code(404).send({ error: "Persona no encontrada" });
    const asOf = q.asOf ?? currentMonth();
    const [rows, payments] = await Promise.all([accruals(person.id), prisma.personPayment.findMany({ where: { personId: person.id }, include: { transaction: { select: { accountId: true } } }, orderBy: { date: "desc" } })]);

    const byMonth = new Map<string, PersonMonthDto & { cents: number }>();
    for (const r of rows) {
      const m = byMonth.get(r.month) ?? { month: r.month, total: 0, lines: [], cents: 0 };
      m.cents += r.cents;
      m.lines.push(r.line);
      byMonth.set(r.month, m);
    }
    const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map(({ cents, ...m }) => ({ ...m, total: fromCents(cents) }));
    const accrued = rows.filter((r) => r.month <= asOf).reduce((a, r) => a + r.cents, 0);
    const upcoming = rows.filter((r) => r.month > asOf).reduce((a, r) => a + r.cents, 0);
    const paid = payments.reduce((a, p) => a + toCents(num(p.amount)), 0);
    const detail: PersonDetailDto = {
      personId: person.id, name: person.name, accrued: fromCents(accrued), paid: fromCents(paid), balance: fromCents(accrued - paid), upcoming: fromCents(upcoming),
      months,
      payments: payments.map((p) => ({ id: p.id, date: fromDbDate(p.date), amount: num(p.amount), note: p.note, accountId: p.transaction?.accountId ?? null })),
    };
    return detail;
  });

  app.post<{ Params: { id: string } }>("/api/persons/:id/charges", async (req, reply) => {
    const body = parse(personChargeInput, req.body, reply);
    if (!body) return;
    if (!(await prisma.person.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Persona no encontrada" });
    const c = await prisma.personCharge.create({ data: { ...body, personId: req.params.id } });
    return reply.code(201).send({ id: c.id });
  });

  app.delete<{ Params: { id: string; chargeId: string } }>("/api/persons/:id/charges/:chargeId", async (req, reply) => {
    await prisma.personCharge.deleteMany({ where: { id: req.params.chargeId, personId: req.params.id } });
    return reply.code(204).send();
  });

  /** Registra lo que te pagó la persona: queda como ingreso en la categoría Reintegros de la cuenta elegida. */
  app.post<{ Params: { id: string } }>("/api/persons/:id/payments", async (req, reply) => {
    const body = parse(personPaymentInput, req.body, reply);
    if (!body) return;
    const person = await prisma.person.findUnique({ where: { id: req.params.id } });
    if (!person) return reply.code(404).send({ error: "Persona no encontrada" });
    if (!(await prisma.account.findUnique({ where: { id: body.accountId } }))) return reply.code(400).send({ error: "Cuenta inexistente" });
    const categoryId = await reimbursementCategoryId();
    const payment = await prisma.personPayment.create({
      data: {
        personId: person.id, date: toDbDate(body.date), amount: body.amount, note: body.note,
        transaction: {
          create: {
            date: toDbDate(body.date), period: body.date.slice(0, 7), amount: body.amount, type: "INCOME", status: "PAID",
            description: body.note ? `Pago de ${person.name}: ${body.note}` : `Pago de ${person.name}`, categoryId, accountId: body.accountId,
          },
        },
      },
    });
    return reply.code(201).send({ id: payment.id });
  });

  app.delete<{ Params: { id: string; paymentId: string } }>("/api/persons/:id/payments/:paymentId", async (req, reply) => {
    await prisma.personPayment.deleteMany({ where: { id: req.params.paymentId, personId: req.params.id } });
    return reply.code(204).send();
  });
}
