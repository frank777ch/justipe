import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Error de negocio con código estable para que la app pueda reaccionar a cada caso.
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (entity: string) => new ApiError(404, 'not_found', `${entity} no encontrado`);

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

// Drizzle envuelve los errores del driver; el código SQLSTATE está en la causa
function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current === 'object' && current !== null && 'code' in current && typeof current.code === 'string') {
      return current.code;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

// Manejador global: errores de negocio, restricciones de Postgres y fallos inesperados
export function handleError(error: Error, c: Context): Response {
  if (error instanceof ApiError) {
    return c.json(errorBody(error.code, error.message, error.details), error.status);
  }
  // Errores propios de Hono: JWT inválido/ausente (401), JSON mal formado (400), etc.
  if (error instanceof HTTPException) {
    const code = error.status === 401 ? 'unauthorized' : 'bad_request';
    const message = error.status === 401 ? 'Token inválido o ausente' : error.message;
    return c.json(errorBody(code, message), error.status as ContentfulStatusCode);
  }
  switch (postgresErrorCode(error)) {
    case '23505':
      return c.json(errorBody('conflict', 'Ya existe un registro con esos datos'), 409);
    case '23503':
      return c.json(errorBody('invalid_reference', 'Referencia a un registro inexistente'), 422);
    case '23514':
      return c.json(errorBody('constraint_violation', 'Los datos no cumplen las reglas de la base de datos'), 422);
    case '22P02':
      return c.json(errorBody('invalid_input', 'Formato de dato inválido'), 422);
  }
  console.error(error);
  return c.json(errorBody('internal_error', 'Error interno del servidor'), 500);
}

// Hook de @hono/zod-validator: respuesta 422 uniforme con el detalle de cada campo
interface ValidationResult {
  success: boolean;
  error?: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
}

export function validationHook(result: ValidationResult, c: Context): Response | undefined {
  if (result.success || !result.error) return undefined;
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  return c.json(errorBody('validation_error', 'Datos inválidos', issues), 422);
}
