import bcrypt from "bcryptjs";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/plugins/db.js";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Transaction","Payslip","Budget","Category","Account","Person","SharedGroup","SharedExpense","User" RESTART IDENTITY CASCADE`,
  );
}

export async function authedApp() {
  await prisma.user.create({ data: { email: "t@test.com", passwordHash: await bcrypt.hash("password1", 4) } });
  const app = await buildApp();
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "t@test.com", password: "password1" } });
  const cookie = `token=${res.cookies[0]!.value}`;
  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as object, headers: { cookie } });
  return { app, call };
}
