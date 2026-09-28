import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env.js';

// La carpeta drizzle/ está dos niveles arriba tanto desde src/db/ (desarrollo)
// como desde dist/db/ (producción).
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Aplica las migraciones pendientes con una conexión dedicada que se cierra al terminar.
export async function runMigrations(): Promise<void> {
  const migrationClient = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder });
  } finally {
    await migrationClient.end();
  }
}

// Permite ejecutarlo directamente: pnpm db:migrate
const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    await runMigrations();
    console.log('Migraciones aplicadas');
  } catch (error) {
    console.error('Error aplicando migraciones:', error);
    process.exit(1);
  }
}
