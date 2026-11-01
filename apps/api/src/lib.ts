import type { FastifyReply } from "fastify";
import type { ZodTypeAny, z } from "zod";

export const num = (d: { toString(): string } | null | undefined): number => (d == null ? 0 : Number(d.toString()));
export const toDbDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

/** Parsea con zod; si falla responde 400 y devuelve null. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown, reply: FastifyReply): z.infer<T> | null {
  const r = schema.safeParse(data);
  if (!r.success) {
    reply.code(400).send({ error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    return null;
  }
  return r.data;
}

export const currentMonth = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);
