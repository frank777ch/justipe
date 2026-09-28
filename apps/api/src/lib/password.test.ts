import { describe, expect, it } from 'vitest';
import { hashPassword, isValidPasswordHash, verifyPassword } from './password.js';

describe('password', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('mi-clave-secreta');
    expect(isValidPasswordHash(hash)).toBe(true);
    expect(await verifyPassword('mi-clave-secreta', hash)).toBe(true);
    expect(await verifyPassword('otra-clave', hash)).toBe(false);
  });

  it('usa sal aleatoria: dos hashes de la misma clave son distintos', async () => {
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('no usa "$" (se interpolaría en los .env de Docker Compose)', async () => {
    expect(await hashPassword('x')).not.toContain('$');
  });

  it('rechaza hashes mal formados sin lanzar error', async () => {
    expect(isValidPasswordHash('texto-plano')).toBe(false);
    expect(await verifyPassword('x', 'texto-plano')).toBe(false);
    expect(await verifyPassword('x', 'scrypt:16384:8:1:c2FsdA==:corto')).toBe(false);
  });
});
