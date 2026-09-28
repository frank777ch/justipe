import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { db, queryClient } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { env } from './env.js';

// Punto de entrada del servidor: aplica migraciones, arma la app y escucha.
if (env.migrateOnStart) {
  await runMigrations();
  console.log('Migraciones al día');
}

const app = createApp(db, {
  jwtSecret: env.jwtSecret,
  passwordHash: env.appPasswordHash,
  tokenTtlDays: env.jwtTtlDays,
});

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API escuchando en el puerto ${info.port}`);
});

// Apagado ordenado: Docker envía SIGTERM al detener el contenedor
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} recibido, cerrando…`);
  server.close();
  await queryClient.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
