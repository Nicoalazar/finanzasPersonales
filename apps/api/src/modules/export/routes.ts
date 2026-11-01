import type { FastifyInstance } from "fastify";
import { exportQuery, installmentMonths } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { fromDbDate, num, parse } from "../../lib.js";

const TYPE = { INCOME: "Ingreso", EXPENSE: "Gasto", TRANSFER: "Transferencia" } as const;
const STATUS = { PAID: "Pagado", PENDING: "Pendiente" } as const;

/** Campo CSV con separador ';' (Excel en español); comillas dobles escapadas. */
const cell = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Decimales con coma, como los muestra Excel configurado en español. */
const money = (n: number) => n.toFixed(2).replace(".", ",");

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/export/transactions.csv", async (req, reply) => {
    const q = parse(exportQuery, req.query, reply);
    if (!q) return;
    const to = q.to ?? q.from;
    if (to < q.from) return reply.code(400).send({ error: "El hasta es anterior al desde" });
    if (!installmentMonths(q.from, 60).includes(to)) return reply.code(400).send({ error: "Máximo 60 meses" });

    const [rows, accounts, categories] = await Promise.all([
      prisma.transaction.findMany({ where: { period: { gte: q.from, lte: to } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
      prisma.account.findMany(),
      prisma.category.findMany(),
    ]);
    const acc = new Map(accounts.map((a) => [a.id, a.name]));
    const cat = new Map(categories.map((c) => [c.id, c.name]));
    const lines = [
      ["Fecha", "Tipo", "Estado", "Categoría", "Cuenta", "Cuenta destino", "Monto", "Descripción"].join(";"),
      ...rows.map((t) =>
        [
          fromDbDate(t.date), TYPE[t.type], STATUS[t.status], t.categoryId ? (cat.get(t.categoryId) ?? "") : "",
          acc.get(t.accountId) ?? "", t.toAccountId ? (acc.get(t.toAccountId) ?? "") : "", money(num(t.amount)), t.description,
        ].map(cell).join(";"),
      ),
    ];
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="finanzas-${q.from}${to !== q.from ? `_${to}` : ""}.csv"`)
      .send(`﻿${lines.join("\r\n")}\r\n`);
  });
}
