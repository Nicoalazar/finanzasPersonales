import type { FastifyInstance } from "fastify";
import type { Job, Payslip, Transaction } from "@prisma/client";
import {
  fromCents, jobInput, jobPatch, payslipInput, payslipPatch, sacSuggestionCents, sacSuggestionQuery, semesterMonths, toCents,
  type JobDto, type PayslipDto, type SacSuggestionDto,
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

const jobDto = (j: Job & { _count: { payslips: number } }): JobDto => ({
  id: j.id, name: j.name, informal: j.informal, accountId: j.accountId, archived: j.archived, payslipCount: j._count.payslips,
});

type WithTx = Payslip & { transactions: Transaction[] };
const dto = (p: WithTx): PayslipDto => {
  const t = p.transactions[0];
  return {
    id: p.id, jobId: p.jobId, month: p.month, kind: p.kind, gross: p.gross == null ? null : num(p.gross), net: num(p.net),
    date: t ? fromDbDate(t.date) : null, accountId: t?.accountId ?? null, status: t?.status ?? null,
  };
};

const description = (kind: keyof typeof CATEGORY_NAME, job: string, month: string) => `${CATEGORY_NAME[kind]} ${job} ${month}`;

export async function payslipRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ---- trabajos ----
  app.get("/api/jobs", async () =>
    (await prisma.job.findMany({ include: { _count: { select: { payslips: true } } }, orderBy: [{ archived: "asc" }, { name: "asc" }] })).map(jobDto));

  const accountOk = async (id: string | null | undefined) => !id || !!(await prisma.account.findUnique({ where: { id } }));

  app.post("/api/jobs", async (req, reply) => {
    const body = parse(jobInput, req.body, reply);
    if (!body) return;
    if (!(await accountOk(body.accountId))) return reply.code(400).send({ error: "Cuenta inexistente" });
    if (await prisma.job.findUnique({ where: { name: body.name } })) return reply.code(409).send({ error: "Ya existe un trabajo con ese nombre" });
    const j = await prisma.job.create({ data: { ...body, accountId: body.accountId ?? null }, include: { _count: { select: { payslips: true } } } });
    return reply.code(201).send(jobDto(j));
  });

  /** Renombrar un trabajo actualiza la descripción de sus ingresos. */
  app.patch<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    const body = parse(jobPatch, req.body, reply);
    if (!body) return;
    const cur = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!cur) return reply.code(404).send({ error: "Trabajo no encontrado" });
    if (!(await accountOk(body.accountId))) return reply.code(400).send({ error: "Cuenta inexistente" });
    if (body.name && body.name !== cur.name && (await prisma.job.findUnique({ where: { name: body.name } })))
      return reply.code(409).send({ error: "Ya existe un trabajo con ese nombre" });
    await prisma.job.update({ where: { id: cur.id }, data: body });
    if (body.name && body.name !== cur.name) {
      const slips = await prisma.payslip.findMany({ where: { jobId: cur.id }, include: { transactions: true } });
      await prisma.$transaction(slips.flatMap((p) => p.transactions.map((t) =>
        prisma.transaction.update({ where: { id: t.id }, data: { description: description(p.kind, body.name!, p.month) } }))));
    }
    return jobDto((await prisma.job.findUnique({ where: { id: cur.id }, include: { _count: { select: { payslips: true } } } }))!);
  });

  app.delete<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    if (await prisma.payslip.count({ where: { jobId: req.params.id } }))
      return reply.code(409).send({ error: "El trabajo tiene recibos: archivalo en lugar de eliminarlo" });
    await prisma.job.deleteMany({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  // ---- recibos ----
  app.get("/api/payslips", async () => {
    const rows = await prisma.payslip.findMany({ include: { transactions: true }, orderBy: [{ month: "desc" }, { kind: "asc" }] });
    return rows.map(dto);
  });

  /**
   * Sugerencia de SAC: mitad del mayor sueldo mensual del semestre en ese trabajo.
   * Se calcula sobre el bruto; en los trabajos en negro, sobre el neto.
   */
  app.get("/api/payslips/sac-suggestion", async (req, reply) => {
    const q = parse(sacSuggestionQuery, req.query, reply);
    if (!q) return;
    const job = await prisma.job.findUnique({ where: { id: q.jobId } });
    if (!job) return reply.code(404).send({ error: "Trabajo no encontrado" });
    const rows = await prisma.payslip.findMany({ where: { jobId: job.id, kind: "MONTHLY", month: { in: semesterMonths(q.month) } } });
    const basis = job.informal ? "net" : "gross";
    const amounts = rows.map((r) => (basis === "net" ? r.net : r.gross)).filter((a) => a != null).map((a) => toCents(num(a)));
    const cents = sacSuggestionCents(amounts);
    return { month: q.month, basedOnMonths: amounts.length, suggested: cents == null ? null : fromCents(cents), basis } satisfies SacSuggestionDto;
  });

  /** Guarda el recibo y genera el ingreso por el neto en la cuenta elegida. */
  app.post("/api/payslips", async (req, reply) => {
    const body = parse(payslipInput, req.body, reply);
    if (!body) return;
    const job = await prisma.job.findUnique({ where: { id: body.jobId } });
    if (!job) return reply.code(400).send({ error: "Trabajo inexistente" });
    if (!job.informal && body.gross == null) return reply.code(400).send({ error: "Falta el bruto" });
    if (!(await prisma.account.findUnique({ where: { id: body.accountId } }))) return reply.code(400).send({ error: "Cuenta inexistente" });
    if (await prisma.payslip.findUnique({ where: { jobId_month_kind: { jobId: job.id, month: body.month, kind: body.kind } } }))
      return reply.code(409).send({ error: "Ya cargaste ese recibo para este trabajo" });

    const categoryId = await incomeCategoryId(body.kind);
    const p = await prisma.payslip.create({
      data: {
        jobId: job.id, month: body.month, kind: body.kind, gross: job.informal ? null : body.gross!, net: body.net,
        transactions: {
          create: {
            date: toDbDate(body.date), period: body.date.slice(0, 7), amount: body.net, type: "INCOME", status: body.paid ? "PAID" : "PENDING",
            description: description(body.kind, job.name, body.month), categoryId, accountId: body.accountId,
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
    const cur = await prisma.payslip.findUnique({ where: { id: req.params.id }, include: { transactions: true, job: true } });
    if (!cur) return reply.code(404).send({ error: "Recibo no encontrado" });
    if (body.accountId && !(await prisma.account.findUnique({ where: { id: body.accountId } }))) return reply.code(400).send({ error: "Cuenta inexistente" });

    const tx = cur.transactions[0];
    await prisma.$transaction([
      prisma.payslip.update({ where: { id: cur.id }, data: { gross: cur.job.informal ? null : body.gross, net: body.net } }),
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
