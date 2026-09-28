# justipe

App móvil personal para controlar gastos. Un solo usuario, multimoneda (S/ y US$), offline-first.

## Stack

| Capa | Tecnología |
|---|---|
| App | Expo (React Native) + expo-router + TypeScript, TanStack Query + MMKV |
| API | Hono + Drizzle ORM + TypeScript (Node 22) |
| BD | PostgreSQL 16 |
| Deploy | Docker Compose detrás de Caddy, GitHub Actions por SSH |

## Estructura

```
apps/
  api/                 API Hono + Drizzle
    src/db/schema/     esquema de la BD (un archivo por dominio)
    drizzle/           migraciones SQL generadas (versionadas)
  mobile/              app Expo (fase 4)
packages/
  shared/              tipos compartidos API ↔ app (fase 2)
infra/
  docker-compose.yml       producción: api + postgres (< 400 MB RAM)
  docker-compose.dev.yml   override local: publica Postgres en localhost
  caddy/justipe.caddy      snippet para el Caddyfile del VPS
```

## Esquema de datos

| Tabla | Propósito |
|---|---|
| `categories` | Categorías de gasto/ingreso |
| `movements` | Cada gasto o ingreso: `amount_original`, `currency`, `exchange_rate`, `amount_pen` (generada) |
| `recurring` | Plantillas recurrentes (mensual o quincenal: días 15 y fin de mes) |
| `debts` | Deudas en ambas direcciones; el saldo se calcula a partir de los movimientos con `debt_id` |
| `exchange_rates` | Tipo de cambio USD→PEN por día (`api` o `manual`) |
| `quick_amounts` | Botones de montos frecuentes para el registro rápido |

Reglas clave:

- Los ids son UUID generados por el cliente, lo que permite crear registros offline.
- Todas las tablas sincronizables tienen `created_at`, `updated_at` (lo mantiene un trigger) y `deleted_at` (borrado lógico).
- **Gasto fijo** = movimiento con `recurring_id`; **variable** = sin él.
- `amount_pen = round(amount_original * exchange_rate, 2)`, garantizado por Postgres.

## Desarrollo local

Requisitos: Node 22, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env          # completa POSTGRES_PASSWORD y DATABASE_URL
pnpm install
pnpm compose:dev              # levanta solo Postgres en 127.0.0.1:5432
pnpm db:migrate               # aplica migraciones
pnpm db:seed                  # categorías y montos rápidos iniciales
pnpm api:dev                  # API en http://localhost:3000/health
```

### Cambios de esquema

1. Edita los archivos en `apps/api/src/db/schema/`.
2. `pnpm db:generate` genera la migración SQL en `apps/api/drizzle/`.
3. Revisa el SQL y súbelo al repo. La API aplica las migraciones pendientes al arrancar (`MIGRATE_ON_START=true`).

## Producción (VPS)

```bash
cp .env.example .env          # valores reales, fuera del repo
pnpm compose:up               # o: docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml exec api node dist/db/seed.js
```

La API queda publicada solo en `127.0.0.1:3000`. Agrega `infra/caddy/justipe.caddy` a tu Caddyfile.

Límites de memoria: Postgres 256 MB y API 128 MB. En reposo se miden ~30 MB y ~20 MB.
