import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { prisma } from "./plugins/db.js";
import { seedDefaults } from "./seed-data.js";

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

/** En una base sin categorías (primer arranque, p. ej. en Render) carga la configuración inicial genérica. */
export async function ensureDefaults() {
  if ((await prisma.category.count()) === 0) {
    await seedDefaults();
    console.log("Categorías iniciales cargadas");
  }
}
