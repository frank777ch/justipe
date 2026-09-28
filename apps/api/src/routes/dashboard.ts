import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../db/types.js';
import { todayInLima } from '../lib/dates.js';
import { validationHook } from '../lib/errors.js';
import { getDashboardSummary } from '../services/dashboard.js';

const querySchema = z.object({
  // Mes a consultar; por defecto el actual en hora de Lima
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido, se espera YYYY-MM')
    .optional(),
});

export function dashboardRoutes(db: Database) {
  return new Hono().get('/', zValidator('query', querySchema, validationHook), async (c) => {
    const today = todayInLima();
    const month = c.req.valid('query').month ?? today.slice(0, 7);
    return c.json(await getDashboardSummary(db, month, today));
  });
}
