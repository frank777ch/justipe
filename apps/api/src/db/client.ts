import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema/index.js';

// Pool pequeño a propósito: un solo usuario y Postgres limitado a 20 conexiones.
export const queryClient = postgres(env.databaseUrl, {
  max: env.dbPoolMax,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
