import { zValidator } from '@hono/zod-validator';
import { loginSchema } from '@justipe/shared';
import { Hono, type Context } from 'hono';
import { jwt, sign } from 'hono/jwt';
import type { AppConfig } from '../config.js';
import { ApiError, validationHook } from '../lib/errors.js';
import { verifyPassword } from '../lib/password.js';

const JWT_ALG = 'HS256';
const MAX_FAILURES = 5;
const BLOCK_WINDOW_MS = 15 * 60 * 1000;

// Limitador de intentos fallidos en memoria, por IP. Suficiente para un solo usuario
// y un solo proceso; se reinicia si la API se reinicia.
function createLoginLimiter(now: () => number = Date.now) {
  const failures = new Map<string, { count: number; resetAt: number }>();

  function purgeExpired(): void {
    const current = now();
    for (const [key, entry] of failures) {
      if (entry.resetAt <= current) failures.delete(key);
    }
  }

  return {
    isBlocked(key: string): boolean {
      const entry = failures.get(key);
      return entry !== undefined && entry.resetAt > now() && entry.count >= MAX_FAILURES;
    },
    registerFailure(key: string): void {
      purgeExpired();
      const entry = failures.get(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, resetAt: now() + BLOCK_WINDOW_MS });
    },
    reset(key: string): void {
      failures.delete(key);
    },
  };
}

// Caddy reemplaza X-Forwarded-For con la IP real del cliente; la API solo escucha en 127.0.0.1
function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export function authRoutes(config: AppConfig) {
  const limiter = createLoginLimiter();

  return new Hono().post('/login', zValidator('json', loginSchema, validationHook), async (c) => {
    const ip = clientIp(c);
    if (limiter.isBlocked(ip)) {
      throw new ApiError(429, 'too_many_attempts', 'Demasiados intentos fallidos, espera 15 minutos');
    }

    const { password } = c.req.valid('json');
    if (!(await verifyPassword(password, config.passwordHash))) {
      limiter.registerFailure(ip);
      throw new ApiError(401, 'invalid_credentials', 'Contraseña incorrecta');
    }
    limiter.reset(ip);

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + config.tokenTtlDays * 24 * 60 * 60;
    const token = await sign({ sub: 'owner', iat: issuedAt, exp: expiresAt }, config.jwtSecret, JWT_ALG);
    return c.json({ token, expiresAt: new Date(expiresAt * 1000).toISOString() });
  });
}

// Middleware que exige "Authorization: Bearer <jwt>" válido y no vencido
export function requireAuth(config: AppConfig) {
  return jwt({ secret: config.jwtSecret, alg: JWT_ALG });
}
