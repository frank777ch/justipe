import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config.js';
import * as schema from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { hashPassword } from '../lib/password.js';

export const TEST_PASSWORD = 'clave-de-prueba-123';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

// Contexto de un archivo de tests: BD propia, app armada con config de prueba,
// token ya emitido y la BD vaciada antes de cada test.
export async function setupTestContext() {
  const client = postgres(process.env.TEST_DATABASE_URL!, { max: 2, onnotice: () => {} });
  const db: Database = drizzle(client, { schema });
  const config: AppConfig = {
    jwtSecret: 'secreto-de-pruebas-con-mas-de-32-caracteres',
    passwordHash: await hashPassword(TEST_PASSWORD),
    tokenTtlDays: 1,
  };
  const app = createApp(db, config);

  const loginResponse = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });
  const { token } = (await loginResponse.json()) as { token: string };

  async function request<T = any>(method: string, path: string, body?: unknown, authToken: string | null = token): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  beforeEach(async () => {
    await db.execute(
      sql`truncate table movements, recurring, debts, quick_amounts, categories, exchange_rates restart identity cascade`,
    );
  });

  afterAll(async () => {
    await client.end();
  });

  return {
    db,
    app,
    config,
    token,
    request,
    get: <T = any>(path: string) => request<T>('GET', path),
    post: <T = any>(path: string, body: unknown) => request<T>('POST', path, body),
    patch: <T = any>(path: string, body: unknown) => request<T>('PATCH', path, body),
    del: <T = any>(path: string) => request<T>('DELETE', path),
  };
}

export type TestContext = Awaited<ReturnType<typeof setupTestContext>>;

// Crea una categoría y devuelve su id
export async function createCategory(ctx: TestContext, name: string, type: 'expense' | 'income' = 'expense'): Promise<string> {
  const response = await ctx.post('/categories', { name, type });
  if (response.status !== 201) throw new Error(`No se pudo crear la categoría: ${JSON.stringify(response.body)}`);
  return response.body.id as string;
}
