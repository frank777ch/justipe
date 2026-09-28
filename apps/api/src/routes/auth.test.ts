import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';
import { setupTestContext, TEST_PASSWORD } from '../test/helpers.js';

const ctx = await setupTestContext();

describe('auth', () => {
  it('/health es público', async () => {
    const response = await ctx.request('GET', '/health', undefined, null);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('login correcto devuelve un JWT con vencimiento', async () => {
    const response = await ctx.request('POST', '/auth/login', { password: TEST_PASSWORD }, null);
    expect(response.status).toBe(200);
    expect(response.body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('las rutas protegidas exigen token', async () => {
    const response = await ctx.request('GET', '/categories', undefined, null);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('rechaza tokens firmados con otro secreto', async () => {
    const forged = await sign({ sub: 'owner', exp: Math.floor(Date.now() / 1000) + 60 }, 'otro-secreto-cualquiera-de-32-caracteres', 'HS256');
    const response = await ctx.request('GET', '/categories', undefined, forged);
    expect(response.status).toBe(401);
  });

  it('rechaza tokens vencidos', async () => {
    const expired = await sign({ sub: 'owner', exp: Math.floor(Date.now() / 1000) - 60 }, ctx.config.jwtSecret, 'HS256');
    const response = await ctx.request('GET', '/categories', undefined, expired);
    expect(response.status).toBe(401);
  });

  it('valida el cuerpo del login', async () => {
    const response = await ctx.request('POST', '/auth/login', {}, null);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_error');
  });

  it('bloquea tras 5 intentos fallidos desde la misma IP', async () => {
    const attempt = (password: string) =>
      ctx.app.request('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ password }),
      });

    for (let i = 0; i < 5; i++) {
      expect((await attempt('incorrecta')).status).toBe(401);
    }
    // Bloqueado incluso con la contraseña correcta
    expect((await attempt(TEST_PASSWORD)).status).toBe(429);

    // Otra IP no se ve afectada
    const other = await ctx.app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(other.status).toBe(200);
  });

  it('responde 404 JSON en rutas inexistentes', async () => {
    const response = await ctx.get('/no-existe');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
