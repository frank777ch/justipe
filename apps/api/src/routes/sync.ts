import { zValidator } from '@hono/zod-validator';
import { gt, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { z } from 'zod';
import { categories, debts, exchangeRates, movements, quickAmounts, recurring } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { validationHook } from '../lib/errors.js';

// Sincronización incremental para la app offline.
//
// GET /sync            -> copia completa (solo registros vivos)
// GET /sync?since=...  -> todo lo que cambió después de "since", incluidos los
//                         borrados lógicos (deletedAt) para que el teléfono los quite.
//
// El cursor devuelto es la hora del servidor MENOS un margen de seguridad: una
// transacción que empezó antes pero confirmó después tendría un updated_at anterior
// al cursor y se perdería. Con el margen, algunos registros llegan repetidos, pero
// el cliente hace upsert por id, así que repetir es inofensivo.

const CURSOR_SAFETY_SECONDS = 60;

const querySchema = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
});

export function syncRoutes(db: Database) {
  return new Hono().get('/', zValidator('query', querySchema, validationHook), async (c) => {
    const { since } = c.req.valid('query');
    const sinceDate = since ? new Date(since) : null;

    const [clock] = await db.execute<{ cursor: Date }>(
      sql`select now() - make_interval(secs => ${CURSOR_SAFETY_SECONDS}) as cursor`,
    );

    // Filtro por tabla: cambios desde el cursor, o solo vivos en la copia completa
    const changed = (table: PgTable & { updatedAt: PgColumn; deletedAt?: PgColumn }): SQL | undefined => {
      if (sinceDate) return gt(table.updatedAt, sinceDate);
      return table.deletedAt ? isNull(table.deletedAt) : undefined;
    };

    const [categoryRows, movementRows, recurringRows, debtRows, quickAmountRows, rateRows] = await Promise.all([
      db.select().from(categories).where(changed(categories)),
      db.select().from(movements).where(changed(movements)),
      db.select().from(recurring).where(changed(recurring)),
      db.select().from(debts).where(changed(debts)),
      db.select().from(quickAmounts).where(changed(quickAmounts)),
      db.select().from(exchangeRates).where(changed(exchangeRates)),
    ]);

    return c.json({
      full: sinceDate === null,
      cursor: new Date(clock!.cursor).toISOString(),
      changes: {
        categories: categoryRows,
        movements: movementRows,
        recurring: recurringRows,
        debts: debtRows,
        quickAmounts: quickAmountRows,
        exchangeRates: rateRows,
      },
    });
  });
}
