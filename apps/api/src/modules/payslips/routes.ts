import type { FastifyInstance } from "fastify";
import type { Payslip, Transaction } from "@prisma/client";
import {
  fromCents, payslipInput, payslipPatch, sacSuggestionCents, sacSuggestionQuery, semesterMonths, toCents,
  type PayslipDto, type SacSuggestionDto,
} from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { fromDbDate, num, parse, toDbDate } from "../../lib.js";

const CATEGORY_NAME = { MONTHLY: "Sueldo", SAC: "SAC" } as const;

/** Categoría de ingresos "Sueldo" / "SAC": se reutiliza la existente o se crea la primera vez. */
async function incomeCategoryId(kind: keyof typeof CATEGORY_NAME): Promise<string> {
  const name = CATEGORY_NAME[kind];
  const c = await prisma.category.upsert({ where: { name_type: { name, type: "INCOME" } }, create: { name, type: "INCOME" }, update: {} });
  return c.id;
}

type WithTx = Payslip & { transactions: Transaction[] };
const dto = (p: WithTx): PayslipDto => {
  const t = p.transactions[0];
  return {
    id: p.id, month: p.month, kind: p.kind, gross: num(p.gross), net: num(p.net),
    date: t ? fromDbDate(t.date) : null, accountId: t?.accountId ?? null, status: t?.status ?? null,
  };
};

export async function payslipRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/payslips", async () => {
    const rows = await prisma.payslip.findMany({ include: { transactions: true }, orderBy: [{ month: "desc" }, { kind: "asc" }] });
    return rows.map(dto);
  });

  /** Sugerencia de SAC bruto: mitad del mayor bruto mensual cargado en el semestre del mes indicado. */
  app.get("/api/payslips/sac-suggestion", async (req, reply) => {
    const q = parse(sacSuggestionQuery, req.query, reply);
    if (!q) return;
    const rows = await prisma.payslip.findMany({ where: { kind: "MONTHLY", month: { in: semesterMonths(q.month) } } });
    const cents = sacSuggestionCents(rows.map((r) => toCents(num(r.gross))));
    return { month: q.month, basedOnMonths: rows.length, suggestedGross: cents == null ? null : fromCents(cents) } satisfies SacSuggestionDto;
  });

  /** Guarda el recibo y genera el ingreso por el neto en la cuenta elegida. */
  app.post("/api/payslips", async (req, reply) => {
    const body = parse(payslipInput, req.body, reply);
    if (!body) return;
    if (!(await prisma.account.findUnique({ where: { id: body.accountId } }))) return reply.code(400).send({ error: "Cuenta inexistente" });
    if (await prisma.payslip.findUnique({ where: { month_kind: { month: body.month, kind: body.kind } } }))
      return reply.code(409).send({ error: "Ya cargaste ese recibo" });

    const categoryId = await incomeCategoryId(body.kind);
    const p = await prisma.payslip.create({
      data: {
        month: body.month, kind: body.kind, gross: body.gross, net: body.net,
        transactions: {
          create: {
            date: toDbDate(body.date), period: body.date.slice(0, 7), amount: body.net, type: "INCOME", status: body.paid ? "PAID" : "PENDING",
            description: `${CATEGORY_NAME[body.kind]} ${body.month}`, categoryId, accountId: body.accountId,
          },
        },
      },
      include: { transactions: true },
    });
    return reply.code(201).send(dto(p));
  });

  /** Editar bruto/neto/fecha/cuenta mantiene sincronizado el ingreso. */
  app.patch<{ Params: { id: string } }>("/api/payslips/:id", async (req, reply) => {
    const body = parse(payslipPatch, req.body, reply);
    if (!body) return;
    const cur = await prisma.payslip.findUnique({ where: { id: req.params.id }, include: { transactions: true } });
    if (!cur) return reply.code(404).send({ error: "Recibo no encontrado" });
    if (body.accountId && !(await prisma.account.findUnique({ where: { id: body.accountId } }))) return reply.code(400).send({ error: "Cuenta inexistente" });

    const tx = cur.transactions[0];
    await prisma.$transaction([
      prisma.payslip.update({ where: { id: cur.id }, data: { gross: body.gross, net: body.net } }),
      ...(tx ? [prisma.transaction.update({
        where: { id: tx.id },
        data: { amount: body.net, accountId: body.accountId, ...(body.date ? { date: toDbDate(body.date), period: body.date.slice(0, 7) } : {}) },
      })] : []),
    ]);
    return dto((await prisma.payslip.findUnique({ where: { id: cur.id }, include: { transactions: true } }))!);
  });

  app.delete<{ Params: { id: string } }>("/api/payslips/:id", async (req, reply) => {
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { payslipId: req.params.id } }),
      prisma.payslip.deleteMany({ where: { id: req.params.id } }),
    ]);
    return reply.code(204).send();
  });
}
