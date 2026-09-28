import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Se ejecuta una vez antes de todos los tests: crea la BD de tests si no existe,
// la deja vacía y aplica las migraciones reales (las mismas de producción).
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL no está definida');

  const databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  // Protección: nunca borrar una base que no sea de tests
  if (!databaseName.endsWith('_test')) {
    throw new Error(`La base de tests debe terminar en "_test" (recibido: "${databaseName}")`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (existing.length === 0) {
      await admin.unsafe(`create database "${databaseName.replaceAll('"', '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
