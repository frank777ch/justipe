import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories.js';
import { currencyEnum, movementTypeEnum, syncColumns } from './common.js';
import { debts } from './debts.js';
import { recurring } from './recurring.js';

// Movimientos: cada gasto o ingreso real.
// Para multimoneda se guarda el monto original, la moneda, el tipo de cambio usado
// y el monto en soles. amount_pen es una columna generada: se almacena físicamente,
// pero Postgres garantiza que siempre sea round(amount_original * exchange_rate, 2).
// Gasto fijo = tiene recurring_id. Gasto variable = recurring_id en null.
export const movements = pgTable(
  'movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: movementTypeEnum('type').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    amountOriginal: numeric('amount_original', { precision: 14, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    // Soles por unidad de la moneda original; 1 si la moneda es PEN
    exchangeRate: numeric('exchange_rate', { precision: 10, scale: 4 }).notNull().default('1'),
    amountPen: numeric('amount_pen', { precision: 14, scale: 2 })
      .notNull()
      .generatedAlwaysAs(sql`round(amount_original * exchange_rate, 2)`),
    // Día contable en hora de Lima
    occurredOn: date('occurred_on').notNull(),
    note: text('note'),
    recurringId: uuid('recurring_id').references(() => recurring.id, { onDelete: 'set null' }),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'set null' }),
    ...syncColumns,
  },
  (t) => [
    // Evita que el cron genere dos veces el mismo periodo. Incluye filas borradas
    // a propósito: si borras un recurrente generado, no vuelve a aparecer.
    uniqueIndex('movements_recurring_period_uq')
      .on(t.recurringId, t.occurredOn)
      .where(sql`${t.recurringId} IS NOT NULL`),
    // Dashboard y calendario consultan por rango de fechas
    index('movements_occurred_on_idx')
      .on(t.occurredOn)
      .where(sql`${t.deletedAt} IS NULL`),
    index('movements_debt_id_idx')
      .on(t.debtId)
      .where(sql`${t.debtId} IS NOT NULL`),
    index('movements_updated_at_idx').on(t.updatedAt),
    check('movements_amount_positive', sql`${t.amountOriginal} > 0`),
    check('movements_rate_positive', sql`${t.exchangeRate} > 0`),
    check('movements_pen_rate_is_one', sql`${t.currency} <> 'PEN' OR ${t.exchangeRate} = 1`),
  ],
);

export type Movement = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;
