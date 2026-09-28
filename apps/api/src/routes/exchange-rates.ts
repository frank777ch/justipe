import { zValidator } from '@hono/zod-validator';
import { exchangeRateListQuerySchema, exchangeRateUpsertSchema, isoDateSchema } from '@justipe/shared';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { exchangeRates } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { todayInLima } from '../lib/dates.js';
import { ApiError, validationHook } from '../lib/errors.js';
import { ExchangeRateProviderError, syncExchangeRate, type ExchangeRateProvider } from '../services/exchange-rate.js';

const dateParamValidator = zValidator('param', z.object({ date: isoDateSchema }), validationHook);
const latestQueryValidator = zValidator('query', z.object({ date: isoDateSchema.optional() }), validationHook);
const syncBodyValidator = zValidator('json', z.object({ date: isoDateSchema.optional() }).default({}), validationHook);

// Tipo de cambio USD → PEN por día: consulta, edición manual y sincronización bajo demanda
export function exchangeRateRoutes(db: Database, provider: ExchangeRateProvider | undefined) {
  return new Hono()
    .get('/', zValidator('query', exchangeRateListQuerySchema, validationHook), async (c) => {
      const { from, to, limit } = c.req.valid('query');
      const rows = await db
        .select()
        .from(exchangeRates)
        .where(and(from ? gte(exchangeRates.rateDate, from) : undefined, to ? lte(exchangeRates.rateDate, to) : undefined))
        .orderBy(desc(exchangeRates.rateDate))
        .limit(limit);
      return c.json(rows);
    })

    // Tasa vigente para una fecha (por defecto hoy): la del día o la última anterior
    .get('/latest', latestQueryValidator, async (c) => {
      const date = c.req.valid('query').date ?? todayInLima();
      const [row] = await db
        .select()
        .from(exchangeRates)
        .where(lte(exchangeRates.rateDate, date))
        .orderBy(desc(exchangeRates.rateDate))
        .limit(1);
      if (!row) throw new ApiError(404, 'not_found', `No hay tipo de cambio para ${date} ni fechas anteriores`);
      return c.json(row);
    })

    // Consulta apis.net.pe ahora (por defecto para hoy) sin esperar al cron
    .post('/sync', syncBodyValidator, async (c) => {
      if (!provider) {
        throw new ApiError(503, 'provider_disabled', 'La consulta automática del tipo de cambio está desactivada');
      }
      const date = c.req.valid('json').date ?? todayInLima();
      try {
        return c.json(await syncExchangeRate(db, provider, date));
      } catch (error) {
        if (error instanceof ExchangeRateProviderError || (error instanceof Error && error.name === 'TimeoutError')) {
          throw new ApiError(502, 'provider_error', `No se pudo consultar el tipo de cambio: ${error.message}`);
        }
        throw error;
      }
    })

    // Edición manual: crea o reemplaza la tasa del día y la marca como manual
    .put('/:date', dateParamValidator, zValidator('json', exchangeRateUpsertSchema, validationHook), async (c) => {
      const { date } = c.req.valid('param');
      const { buy, sell } = c.req.valid('json');
      const [row] = await db
        .insert(exchangeRates)
        .values({ rateDate: date, buy, sell, source: 'manual' })
        .onConflictDoUpdate({ target: exchangeRates.rateDate, set: { buy, sell, source: 'manual' } })
        .returning();
      return c.json(row);
    })

    // Borra la tasa del día (p. ej. para volver a la automática; el cron la repone)
    .delete('/:date', dateParamValidator, async (c) => {
      const [deleted] = await db
        .delete(exchangeRates)
        .where(eq(exchangeRates.rateDate, c.req.valid('param').date))
        .returning({ rateDate: exchangeRates.rateDate });
      if (!deleted) throw new ApiError(404, 'not_found', 'Tipo de cambio no encontrado');
      return c.body(null, 204);
    });
}
