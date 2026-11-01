import { existsSync, readFileSync } from "node:fs";
import { prisma } from "./plugins/db.js";
import { seedDefaults, seedLocal, type LocalSeed } from "./seed-data.js";

// Uso: pnpm --filter @finanzas/api seed [ruta/a/seed.local.json]
const file = process.argv[2] ?? "seed.local.json";

await seedDefaults();
console.log("Categorías y grupo Hogar listos");
if (existsSync(file)) {
  await seedLocal(JSON.parse(readFileSync(file, "utf8")) as LocalSeed);
  console.log(`Datos personales cargados desde ${file}`);
} else {
  console.log(`(sin ${file}: no se cargaron cuentas, tarjetas ni personas)`);
}
await prisma.$disconnect();
