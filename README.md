# Finanzas

App personal de ingresos y gastos (monorepo pnpm: `apps/api`, `apps/web`, `packages/shared`).

## Desarrollo local
```bash
cp .env.example .env              # ajustar ADMIN_EMAIL / ADMIN_PASSWORD
docker compose up -d db           # Postgres en localhost:5433
pnpm install
pnpm --filter @finanzas/shared build
cd apps/api && pnpm exec prisma migrate dev && cd ../..
pnpm dev                          # API :3000 + web :5173
```

## Probar la imagen de producción
```bash
docker compose --profile app up --build
```

## Deploy en Render
1. Crear una base en Neon y copiar su `DATABASE_URL` (con `?sslmode=require`).
2. Subir el repo a GitHub y crear un Blueprint en Render apuntando a `render.yaml`.
3. Completar `DATABASE_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. El primer arranque aplica las migraciones y crea el usuario.
