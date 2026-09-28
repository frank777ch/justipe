import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema/index.js';

// Tipo de la instancia de Drizzle. Las rutas lo reciben por parámetro (inyección)
// para que los tests usen su propia base de datos.
export type Database = PostgresJsDatabase<typeof schema>;

// Transacción de Drizzle (lo que recibe el callback de db.transaction)
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Cualquier cosa que pueda ejecutar consultas: la BD o una transacción en curso
export type DbExecutor = Database | Transaction;
