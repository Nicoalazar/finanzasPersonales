# Finanzas

App personal para llevar ingresos y gastos (reemplaza los Excels). Un solo usuario, una sola moneda (ARS).
Monorepo pnpm: `apps/api` (Fastify + Prisma + Postgres), `apps/web` (React + Vite + Tailwind), `packages/shared` (esquemas y lógica de negocio).

## Qué hace
| Pantalla | Para qué |
|---|---|
| **Resumen** | Resultado del mes, gasto/ingreso, tarjetas/ingreso, patrimonio; gastos por mes (tarjetas / recurrentes / otros), resultado acumulado, gasto por categoría, presupuestos en alerta y quién te debe. Exporta CSV. |
| **Mes** | Movimientos del mes, pendientes (los recurrentes se generan solos al abrir el mes), gasto neto = gasto − reintegros. |
| **Tarjetas** | Compras en cuotas (y en USD, en un solo pago) con reparto a terceros, resumen mensual (7‰, ajuste, reintegros), cierre y vencimiento editables mes a mes, pago del resumen, compromisos de los próximos 12 meses. |
| **Compartidos** | Gastos comunes con tu pareja cargados en el Google Form: se importan del CSV de respuestas (subiendo el archivo o con el link publicado), cuentan **tu parte** según el % del mes del grupo *Hogar* y calculan el saldo. Tus pagos salen de una cuenta o de una tarjeta; lo que te devuelve entra como *Reintegros*. |
| **Personas** | Cuánto te debe cada una, detalle por mes, cargos manuales en cuotas y pagos (entran como ingreso en la categoría *Reintegros*). |
| **Recurrentes** | Alquiler, servicios, suscripciones; frecuencia mensual/bimestral/anual, cambios de precio con vigencia, grupos compartidos (*Hogar*) con **% editable mes a mes**. |
| **Presupuestos** | Por categoría y mes, con alerta al 80 % y al 100 %; copiar del mes anterior con aumento. |
| **Sueldos** | Varios trabajos, cada uno con su recibo mensual (bruto y neto) + SAC; los trabajos en negro llevan solo el neto. El neto se carga solo como ingreso. |
| **Inversiones** | Depósitos y retiros, saldo real anotado, ganancia = real − teórico. |

## Desarrollo local
Requisitos: Node ≥ 22, pnpm 12 (`corepack enable`), Docker.

```bash
cp .env.example .env              # ajustar ADMIN_EMAIL / ADMIN_PASSWORD (mín. 8 caracteres)
docker compose up -d db           # Postgres en localhost:5433
pnpm install
pnpm --filter @finanzas/shared build
cd apps/api && pnpm exec prisma migrate deploy && cd ../..
pnpm dev                          # API :3000 + web :5173
```

Tests (usan la base `finanzas_test` del mismo Postgres, que se crea y migra sola):
```bash
pnpm test        # dominio (vitest) + API contra Postgres real
pnpm typecheck
```

### Datos iniciales
Al primer arranque con la base vacía se cargan categorías genéricas, la categoría *Reintegros* y el grupo *Hogar* (35 %).
Tus cuentas, tarjetas y personas van en un archivo **local** que no se sube al repo:

```bash
cp apps/api/seed.local.example.json apps/api/seed.local.json   # editarlo
pnpm --filter @finanzas/api seed                               # idempotente
```

## Probar la imagen de producción
```bash
docker compose --profile app up --build     # http://localhost:3000
```

## Deploy en Render + Neon
1. **Base:** crear un proyecto en [Neon](https://neon.tech) (plan free) y copiar la cadena de conexión **directa** (no la "pooled"; las migraciones de Prisma no funcionan bien con pgbouncer) con `?sslmode=require`.
2. **Repo:** subir este repo a GitHub (`excels/`, `.env` y `seed.local.json` ya están en `.gitignore`).
3. **Render:** *New → Blueprint* apuntando al repo (usa `render.yaml`). Completar:
   - `DATABASE_URL`: la de Neon.
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD`: tu usuario (mín. 8 caracteres). `JWT_SECRET` se genera solo.
4. En el primer arranque se aplican las migraciones, se crea el usuario y se cargan las categorías. Healthcheck: `/api/health`.
5. Cuentas, tarjetas y personas se crean desde la app (Configuración y Tarjetas).

Notas: el plan free de Render duerme el servicio tras 15 min sin uso (el primer pedido tarda ~30 s). Cambiar la contraseña requiere actualizar `ADMIN_PASSWORD` **y** borrar el usuario en la base, porque el admin solo se crea cuando no existe ninguno.

## Convenciones
- Dinero en `Decimal(14,2)` y centavos enteros en el código; fechas en `America/Argentina/Buenos_Aires`.
- Exportación CSV: separador `;`, decimales con coma, UTF-8 con BOM (abre directo en Excel en español).
- Los pagos de resúmenes de tarjeta salen de la cuenta por el total; lo que corresponde a terceros vuelve como *Reintegros* y se descuenta del gasto (gasto neto).

## Compras en dólares
- Al cargar una compra elegí **USD** y el monto en dólares. Es siempre en un solo pago, y si es de un tercero, es la compra completa (100%).
- El formulario sugiere la cotización: el **dólar oficial (punta vendedora)** que consulta el servidor a `FX_API_URL` (por defecto DolarApi, `https://dolarapi.com/v1/dolares/oficial`, campo `venta`), cacheada una hora. Es solo una estimación: se puede editar, y si la API no responde se usa la última cotización cargada en un resumen de esa tarjeta, o se pide a mano. Nunca bloquea guardar la compra.
- Cuando llega el resumen del banco, cargá la **cotización del dólar del resumen** (una sola por resumen, la del PDF) y las percepciones en *Ajuste*. Esa cotización reemplaza a las estimadas en todo: total, lo que te debe cada persona, presupuestos y compromisos. No se puede pagar un resumen con consumos USD sin cargarla.
- El tercero debe `USD × cotización del resumen`; la percepción sobre consumos en dólares queda a tu cargo (va en *Ajuste* y en tu neto propio, pero no en ninguna categoría de presupuesto).
- Con el resumen pagado, la cotización y el Ajuste quedan bloqueados; deshacé el pago para editarlos.
