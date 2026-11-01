import type { FastifyInstance } from "fastify";
import { categoryInput, categoryPatch, type CategoryDto } from "@finanzas/shared";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { parse } from "../../lib.js";

const dto = (c: { id: string; name: string; type: "INCOME" | "EXPENSE"; parentId: string | null; color: string | null }): CategoryDto => ({
  id: c.id, name: c.name, type: c.type, parentId: c.parentId, color: c.color,
});

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/categories", async () => (await prisma.category.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] })).map(dto));

  app.post("/api/categories", async (req, reply) => {
    const body = parse(categoryInput, req.body, reply);
    if (!body) return;
    const dup = await prisma.category.findUnique({ where: { name_type: { name: body.name, type: body.type } } });
    if (dup) return reply.code(409).send({ error: "Ya existe una categoría con ese nombre" });
    return reply.code(201).send(dto(await prisma.category.create({ data: body })));
  });

  app.patch<{ Params: { id: string } }>("/api/categories/:id", async (req, reply) => {
    const body = parse(categoryPatch, req.body, reply);
    if (!body) return;
    if (!(await prisma.category.findUnique({ where: { id: req.params.id } }))) return reply.code(404).send({ error: "Categoría no encontrada" });
    return dto(await prisma.category.update({ where: { id: req.params.id }, data: body }));
  });

  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (req, reply) => {
    const id = req.params.id;
    const [tx, children] = await Promise.all([prisma.transaction.count({ where: { categoryId: id } }), prisma.category.count({ where: { parentId: id } })]);
    if (tx > 0 || children > 0) return reply.code(409).send({ error: "La categoría está en uso" });
    await prisma.category.deleteMany({ where: { id } });
    return reply.code(204).send();
  });
}
