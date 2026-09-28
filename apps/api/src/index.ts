import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { db, queryClient } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { env } from './env.js';
import { startScheduler } from './jobs/scheduler.js';
import { createApisNetPeProvider } from './services/exchange-rate.js';

// Punto de entrada del servidor: aplica migraciones, arma la app y escucha.
if (env.migrateOnStart) {
  await runMigrations();
  console.log('Migraciones al día');
}

const exchangeRateProvider = env.exchangeRateSyncEnabled
  ? createApisNetPeProvider({ url: env.apisNetPeUrl, token: env.apisNetPeToken })
  : undefined;

const app = createApp(db, {
  jwtSecret: env.jwtSecret,
  passwordHash: env.appPasswordHash,
  tokenTtlDays: env.jwtTtlDays,
  exchangeRateProvider,
  corsOrigins: env.corsOrigins,
});

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API escuchando en el puerto ${info.port}`);
});

const scheduler = env.jobsEnabled ? startScheduler({ db, exchangeRateProvider }) : undefined;
if (scheduler) {
  console.log('Tareas programadas:', scheduler.nextRuns());
}

// Apagado ordenado: Docker envía SIGTERM al detener el contenedor
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} recibido, cerrando…`);
  scheduler?.stop();
  server.close();
  await queryClient.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
