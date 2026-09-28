import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { queryClient } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { env } from './env.js';

// Fase 1: solo el endpoint de salud que usa el healthcheck de Docker.
// El resto de rutas llega en la fase 2.
const app = new Hono();

app.get('/health', async (c) => {
  try {
    await queryClient`select 1`;
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'error', detail: 'database unreachable' }, 503);
  }
});

if (env.migrateOnStart) {
  await runMigrations();
  console.log('Migraciones al día');
}

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
