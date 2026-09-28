import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { sql } from 'drizzle-orm';
import type { AppConfig } from './config.js';
import type { Database } from './db/types.js';
import { errorBody, handleError } from './lib/errors.js';
import { authRoutes, requireAuth } from './routes/auth.js';
import { categoryRoutes } from './routes/categories.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { debtRoutes } from './routes/debts.js';
import { exchangeRateRoutes } from './routes/exchange-rates.js';
import { movementRoutes } from './routes/movements.js';
import { quickAmountRoutes } from './routes/quick-amounts.js';
import { recurringRoutes } from './routes/recurring.js';
import { syncRoutes } from './routes/sync.js';

// Construye la aplicación Hono. No lee process.env ni abre conexiones:
// todo se inyecta, así index.ts y los tests la arman con su propia BD y config.
export function createApp(db: Database, config: AppConfig) {
  const app = new Hono();

  app.use(secureHeaders());
  // CORS solo para la versión web de la app (la app nativa no lo necesita)
  if (config.corsOrigins && config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins, allowHeaders: ['authorization', 'content-type'], maxAge: 600 }));
  }
  app.use(bodyLimit({ maxSize: 256 * 1024 }));

  // Rutas públicas
  app.get('/health', async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'error', detail: 'database unreachable' }, 503);
    }
  });
  app.route('/auth', authRoutes(config));

  // Rutas protegidas con JWT
  const protectedPaths = ['/categories', '/movements', '/recurring', '/debts', '/quick-amounts', '/exchange-rates', '/dashboard', '/sync'];
  const auth = requireAuth(config);
  for (const path of protectedPaths) {
    app.use(path, auth);
    app.use(`${path}/*`, auth);
  }
  app.route('/categories', categoryRoutes(db));
  app.route('/movements', movementRoutes(db));
  app.route('/recurring', recurringRoutes(db));
  app.route('/debts', debtRoutes(db));
  app.route('/quick-amounts', quickAmountRoutes(db));
  app.route('/dashboard', dashboardRoutes(db));
  app.route('/sync', syncRoutes(db));
  app.route('/exchange-rates', exchangeRateRoutes(db, config.exchangeRateProvider));

  app.notFound((c) => c.json(errorBody('not_found', 'Ruta no encontrada'), 404));
  app.onError(handleError);

  return app;
}

export type App = ReturnType<typeof createApp>;
