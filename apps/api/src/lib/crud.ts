import { zValidator } from '@hono/zod-validator';
import { uuidSchema } from '@justipe/shared';
import { z } from 'zod';
import { ApiError, validationHook } from './errors.js';

// Validador del parámetro :id de las rutas
export const idParamValidator = zValidator('param', z.object({ id: uuidSchema }), validationHook);

// Resuelve un POST cuyo id ya existía (reintento desde la app offline):
// si el registro sigue vivo se devuelve tal cual (idempotencia); si fue borrado, 409.
export function resolveExistingOnCreate<T extends { deletedAt: Date | null }>(existing: T | undefined, entity: string): T {
  if (!existing) {
    throw new ApiError(409, 'conflict', `${entity}: conflicto al crear el registro`);
  }
  if (existing.deletedAt !== null) {
    throw new ApiError(409, 'already_deleted', `${entity} con ese id ya existía y fue eliminado`);
  }
  return existing;
}

// Quita las claves undefined para que un PATCH no pise columnas no enviadas
export function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
