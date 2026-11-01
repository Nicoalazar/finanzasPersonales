import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "No autenticado" });
  }
}
