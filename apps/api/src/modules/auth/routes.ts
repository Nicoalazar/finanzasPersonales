import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/db.js";
import { requireAuth } from "../../plugins/auth.js";
import { config } from "../../config.js";

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const COOKIE = "token";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Datos inválidos" });
    const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
    const ok = user && (await bcrypt.compare(body.data.password, user.passwordHash));
    if (!user || !ok) return reply.code(401).send({ error: "Credenciales incorrectas" });
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: "30d" });
    reply
      .setCookie(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      })
      .send({ email: user.email });
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" }).send({ ok: true });
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: (req.user as { sub: string }).sub } });
    return { email: user.email };
  });
}
