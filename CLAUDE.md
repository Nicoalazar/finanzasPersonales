# CLAUDE.md

App personal de finanzas (un usuario, ARS). Monorepo pnpm: `apps/api` (Fastify + Prisma + Postgres), `apps/web` (React + Vite + Tailwind), `packages/shared` (esquemas zod, DTOs y lógica de dominio). Ver `README.md` para pantallas y uso.

## Comandos
- `pnpm --filter @finanzas/shared build`: hay que compilar `shared` antes de typecheck o tests de `api`/`web` (si no, "Cannot find module '@finanzas/shared'").
- Tests de API: necesitan Postgres. Por defecto usan `postgresql://finanzas:finanzas@localhost:5433/finanzas_test` (docker compose); se cambia con `TEST_DATABASE_URL`. `cd apps/api && pnpm test` aplica las migraciones solo.
- Tests de dominio: `cd packages/shared && npx vitest run`.
- Typecheck: `cd apps/api && npx tsc -p tsconfig.json --noEmit` y `cd apps/web && npx tsc --noEmit -p .`.
- Migraciones nuevas: `cd apps/api && npx prisma migrate dev --create-only --name <nombre>`.

## Criterios de cálculo
- **Gasto por categoría** (`apps/api/src/modules/spending/service.ts`, `spendingParts`): solo mi parte. Cuotas de tarjeta netas de terceros; de los recurrentes de un grupo con persona se descuenta lo que esa persona me debe; de Compartidos cuenta mi % del mes; lo que otra persona pagó por mí cuenta en el mes de cada cuota. Pagos de resumen, pagos a/de personas y saldos con la pareja son caja, no gasto.
- **Resumen (dashboard)**: la serie mensual es base caja (tarjeta = pago del resumen, reintegros aparte, bajo el cero en el gráfico). El gráfico de categorías toma la tarjeta del mes anterior (la que se paga en el mes).
- **Proyección** (`apps/api/src/modules/projection/service.ts`): ingresos = recibo real o último neto por trabajo + aguinaldo (jun/dic, mitad del mayor neto del semestre, solo trabajos registrados). Gastos = mi parte de recurrentes + mi neto de resúmenes por mes de vencimiento + deudas I_OWE + gasto variable. La inflación mensual (`ProjectionSettings`) se aplica a recurrentes y variable, no al sueldo ni a las cuotas. Los reintegros no se proyectan (los gastos ya son mi parte).
  - Gasto variable = promedio de los últimos 3 meses completos con gastos (sin recurrentes ni cuotas 2.ª en adelante); si no hay meses completos usa el mes en curso y marca `partial`. Un monto propio por categoría (`SpendingEstimate`) reemplaza al promedio.
  - **Limitación conocida: el promedio de Compartidos no sigue los cambios de %.** Los gastos del formulario de Compartidos entran al variable como *mi parte en pesos*, calculada con el % de cada mes pasado. Si mi % del grupo Hogar cambia a futuro, la proyección sigue usando la parte vieja (ej.: súper de $ 300.000 al 35 % = $ 105.000; al pasar al 50 % debería ser $ 150.000 y sigue en $ 105.000). Los recurrentes del grupo Hogar no tienen el problema: se calculan mes a mes con el % vigente. Hoy se corrige a mano cargando un monto propio = parte promedio × nuevo % ÷ % viejo. Arreglarlo de verdad implicaría promediar el total compartido por categoría y aplicarle el % de cada mes futuro.
  - Tampoco se proyectan las cuotas futuras de compras en cuotas que todavía no se hicieron (solo entra la 1.ª cuota vía promedio), ni ingresos que no sean sueldo.
- La tabla `Budget` (topes por categoría de la versión anterior) se conserva sin uso para no perder datos.
