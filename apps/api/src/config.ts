import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default("development"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  /** Dólar oficial para sugerir la cotización al cargar compras USD (campo `venta` en la respuesta). */
  FX_API_URL: z.string().url().default("https://dolarapi.com/v1/dolares/oficial"),
});

export const config = schema.parse(process.env);
