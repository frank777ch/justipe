import { defineConfig } from 'vitest/config';

// Carga el .env de la raíz si existe (Vitest no lo hace solo)
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // Sin .env: se usan las variables del entorno (CI)
}

// Base de datos de tests: TEST_DATABASE_URL o, por defecto, la misma de desarrollo
// con el nombre terminado en "_test". El global setup la borra y recrea en cada corrida.
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) {
    throw new Error('Define TEST_DATABASE_URL o DATABASE_URL para correr los tests');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
}

process.env.TEST_DATABASE_URL = resolveTestDatabaseUrl();

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/global-setup.ts'],
    // Todos los archivos comparten la misma BD: se ejecutan de uno en uno
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
      TZ: 'America/Lima',
    },
  },
});
