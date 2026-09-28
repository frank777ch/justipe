import { isValidPasswordHash } from './lib/password.js';

// Lectura y validación de variables de entorno.
// Falla al arrancar si falta algo obligatorio, en vez de fallar a mitad de una petición.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`La variable ${name} debe ser un entero positivo (recibido: "${raw}")`);
  }
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`La variable ${name} debe ser "true" o "false" (recibido: "${raw}")`);
}

function jwtSecret(): string {
  const value = required('JWT_SECRET');
  if (value.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres (usa: openssl rand -base64 48)');
  }
  return value;
}

function passwordHash(): string {
  const value = required('APP_PASSWORD_HASH');
  if (!isValidPasswordHash(value)) {
    throw new Error('APP_PASSWORD_HASH no tiene el formato esperado (genéralo con: pnpm hash-password)');
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: integer('PORT', 3000),
  databaseUrl: required('DATABASE_URL'),
  dbPoolMax: integer('DB_POOL_MAX', 5),
  migrateOnStart: boolean('MIGRATE_ON_START', true),
  jwtSecret: jwtSecret(),
  appPasswordHash: passwordHash(),
  jwtTtlDays: integer('JWT_TTL_DAYS', 30),
} as const;
