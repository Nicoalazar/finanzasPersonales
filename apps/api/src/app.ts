import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { prisma } from "./plugins/db.js";
import { authRoutes } from "./modules/auth/routes.js";

export async function buildApp() {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET, cookie: { cookieName: "token", signed: false } });

  app.get("/api/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });
  await app.register(authRoutes);

  // En producción el mismo servicio sirve el front compilado (SPA).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "No encontrado" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
