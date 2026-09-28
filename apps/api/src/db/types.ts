import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema/index.js';

// Tipo de la instancia de Drizzle. Las rutas lo reciben por parámetro (inyección)
// para que los tests usen su propia base de datos.
export type Database = PostgresJsDatabase<typeof schema>;
