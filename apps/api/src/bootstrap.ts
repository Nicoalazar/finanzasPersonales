import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { prisma } from "./plugins/db.js";

/** Crea el usuario único desde ADMIN_EMAIL/ADMIN_PASSWORD si todavía no existe ninguno. */
export async function ensureAdmin() {
  if ((await prisma.user.count()) > 0) return;
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    console.warn("No hay usuarios y falta ADMIN_EMAIL/ADMIN_PASSWORD");
    return;
  }
  await prisma.user.create({
    data: { email: config.ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 10) },
  });
  console.log(`Usuario ${config.ADMIN_EMAIL} creado`);
}
