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
  shared/              esquemas Zod y tipos compartidos API ↔ app
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
cp .env.example .env          # completa POSTGRES_PASSWORD, DATABASE_URL y JWT_SECRET
pnpm install
pnpm hash-password            # pega el resultado como APP_PASSWORD_HASH en .env
pnpm compose:dev              # levanta solo Postgres en 127.0.0.1:5432
pnpm db:migrate               # aplica migraciones
pnpm db:seed                  # categorías y montos rápidos iniciales
pnpm api:dev                  # API en http://localhost:3000/health
```

### Tests

```bash
pnpm api:test
```

Vitest corre contra un Postgres real: crea la base `<tu_base>_test` (o usa `TEST_DATABASE_URL`), la vacía y aplica las migraciones en cada corrida. Por seguridad, se niega a correr si el nombre de la base no termina en `_test`.

## API

Todas las rutas, salvo `/health` y `/auth/login`, exigen `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API y la BD |
| POST | `/auth/login` | `{ password }` → `{ token, expiresAt }`. Bloquea 15 min tras 5 fallos por IP |
| GET/POST | `/categories` | Listar (`?type=`) / crear |
| GET/PATCH/DELETE | `/categories/:id` | Obtener / editar / borrar |
| GET/POST | `/movements` | Listar (`?from=&to=&type=&categoryId=&debtId=&limit=&offset=`) / crear |
| GET/PATCH/DELETE | `/movements/:id` | |
| GET/POST | `/recurring` | Listar / crear (calcula `nextRunOn`) |
| GET/PATCH/DELETE | `/recurring/:id` | |
| GET/POST | `/debts` | Listar (`?status=open\|closed\|all&direction=`) con `paidAmount` y `balance` |
| GET/PATCH/DELETE | `/debts/:id` | |
| POST | `/recurring/generate` | Genera ahora los recurrentes vencidos |
| GET/POST | `/quick-amounts` | Montos rápidos |
| PATCH/DELETE | `/quick-amounts/:id` | |
| GET | `/exchange-rates` | Listar (`?from=&to=&limit=`) |
| GET | `/exchange-rates/latest` | Tasa vigente para `?date=` (por defecto hoy) |
| POST | `/exchange-rates/sync` | Consulta apis.net.pe ahora (`{ date? }`) |
| PUT/DELETE | `/exchange-rates/:date` | Editar a mano `{ buy, sell }` / borrar |

Convenciones:

- Los montos viajan como **strings decimales** (`"13.00"`, TC `"3.7512"`) para no perder precisión. Al crear se aceptan números o strings.
- Las fechas son `YYYY-MM-DD` (hora de Lima).
- `POST` acepta un `id` generado por el cliente. Si se reintenta con el mismo id, devuelve el registro existente (200), lo que hace seguros los reintentos offline.
- `DELETE` es un borrado lógico (204).
- Los errores tienen la forma `{ error: { code, message, details? } }`: 401 sin token, 404, 409 conflicto, 422 validación o regla de negocio, 429 demasiados intentos.

Reglas de negocio:

- La categoría debe existir y ser del mismo tipo que el movimiento o recurrente.
- **Moneda**: en PEN el TC siempre es 1. En USD sin `exchangeRate` se usa la tasa de venta del día o la última anterior; si no hay ninguna, 422.
- **Deudas**: un movimiento con `debtId` es un pago. En `i_owe` debe ser gasto y en `owed_to_me`, ingreso, siempre en la moneda de la deuda. El saldo es `initialAmount − pagos vivos`.
- **Recurrentes**: `nextRunOn` es la primera fecha desde `startOn`, así que un `startOn` pasado genera los periodos atrasados en la fase 3. Si se edita el calendario, se recalcula desde hoy.

### Cambios de esquema

1. Edita los archivos en `apps/api/src/db/schema/`.
2. `pnpm db:generate` genera la migración SQL en `apps/api/drizzle/`.
3. Revisa el SQL y súbelo al repo. La API aplica las migraciones pendientes al arrancar (`MIGRATE_ON_START=true`).

## Tareas programadas

Corren dentro del proceso de la API con [croner](https://github.com/hexagon/croner), sin contenedor extra. Horarios en hora de Lima:

| Tarea | Horario | Qué hace |
|---|---|---|
| Recurrentes | 00:05 | Crea los movimientos con `nextRunOn <= hoy`, incluidos los periodos atrasados. Es idempotente |
| Tipo de cambio | 07:15, 12:15, 18:15 | Consulta SUNAT vía apis.net.pe y lo guarda. Los intentos extra sirven de reintento |
| Al arrancar | — | Trae el tipo de cambio de hoy si falta y pone al día los recurrentes |

- **Tasas manuales** (`PUT /exchange-rates/:date`): el cron nunca las sobrescribe. Para volver a la automática, borra la tasa con `DELETE`.
- **Recurrente en USD sin tipo de cambio**: queda pendiente y se reintenta en la siguiente corrida. No avanza ni genera con una tasa inventada.
- **Recurrente generado y luego borrado**: no se vuelve a crear.
- **apis.net.pe**: el endpoint v1 funciona sin token, pero limita mucho las peticiones anónimas (429). Por eso se consulta una vez por día y al arrancar solo si falta la tasa. `APIS_NET_PE_TOKEN` es opcional.

## Producción (VPS)

```bash
cp .env.example .env          # valores reales, fuera del repo
pnpm compose:up               # o: docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml exec api node dist/db/seed.js
```

La API queda publicada solo en `127.0.0.1:3000`. Agrega `infra/caddy/justipe.caddy` a tu Caddyfile.

Límites de memoria: Postgres 256 MB y API 128 MB. En reposo se miden ~30 MB cada uno.
