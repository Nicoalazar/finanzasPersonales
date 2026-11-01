import type { FastifyInstance } from "fastify";
import { personInput, type PersonDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { parse } from "../../lib.js";

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
}
