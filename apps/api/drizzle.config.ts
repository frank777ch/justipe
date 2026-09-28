import { defineConfig } from 'drizzle-kit';

// Configuración de drizzle-kit: genera migraciones SQL a partir del esquema TypeScript.
// "generate" no necesita conexión; DATABASE_URL solo se usa en comandos como "studio".
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
