import { prisma } from "./plugins/db.js";

/** Categorías tomadas de los conceptos de los Excels originales. */
export const EXPENSE_CATEGORIES = [
  "Alquiler", "Expensas", "Cochera", "ABL", "Luz", "Internet", "Seguro auto", "Patente auto", "Suscripciones",
  "Comidas en el trabajo", "Transporte", "Salidas y juntadas", "Delivery", "Deportes", "Salud y farmacia", "Gimnasio",
  "Ropa", "Regalos", "Peluquería", "Nafta y viajes", "Vacaciones", "Compras del hogar",
];
export const INCOME_CATEGORIES = ["Sueldo", "SAC", "Extras", "Rendimientos", "Desinversiones"];

/** Datos personales opcionales (cuentas, tarjetas, personas). Viven en seed.local.json, que no se sube al repo. */
export interface LocalSeed {
  accounts?: { name: string; kind?: "CASH" | "BANK" | "WALLET" | "INVESTMENT"; initialBalance?: number }[];
  cards?: { name: string; closingDay: number; dueDay: number; isThirdParty?: boolean }[];
  persons?: string[];
}

/** Configuración inicial genérica, idempotente: se puede correr las veces que haga falta. */
export async function seedDefaults(): Promise<void> {
  // Una sola consulta; las que ya existen (mismo nombre y tipo) se saltean.
  await prisma.category.createMany({
    data: [
      ...EXPENSE_CATEGORIES.map((name) => ({ name, type: "EXPENSE" as const })),
      ...INCOME_CATEGORIES.map((name) => ({ name, type: "INCOME" as const })),
    ],
    skipDuplicates: true,
  });

  // Categoría de reintegros (pagos de terceros): se descuenta del gasto en lugar de contar como ingreso.
  const flagged = await prisma.category.findFirst({ where: { isReimbursement: true } });
  if (!flagged) {
    await prisma.category.upsert({
      where: { name_type: { name: "Reintegros", type: "INCOME" } },
      create: { name: "Reintegros", type: "INCOME", isReimbursement: true },
      update: { isReimbursement: true },
    });
  }

  await prisma.sharedGroup.upsert({ where: { name: "Hogar" }, create: { name: "Hogar", myPercent: 35 }, update: {} });
}

export async function seedLocal(data: LocalSeed): Promise<void> {
  for (const a of data.accounts ?? []) {
    if (!(await prisma.account.findFirst({ where: { name: a.name } })))
      await prisma.account.create({ data: { name: a.name, kind: a.kind ?? "BANK", initialBalance: a.initialBalance ?? 0 } });
  }
  for (const c of data.cards ?? []) {
    if (!(await prisma.creditCard.findFirst({ where: { name: c.name } })))
      await prisma.creditCard.create({ data: { name: c.name, closingDay: c.closingDay, dueDay: c.dueDay, isThirdParty: c.isThirdParty ?? false } });
  }
  for (const name of data.persons ?? []) await prisma.person.upsert({ where: { name }, create: { name }, update: {} });
}
