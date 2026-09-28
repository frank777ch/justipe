import { sql } from 'drizzle-orm';
import { boolean, check, date, index, numeric, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories.js';
import { currencyEnum, frequencyEnum, movementTypeEnum, syncColumns } from './common.js';
import { debts } from './debts.js';

// Plantillas de gastos/ingresos recurrentes.
// El cron de la fase 3 crea un movimiento por cada fecha vencida y adelanta next_run_on.
// - monthly: se genera el día day_of_month (si el mes es más corto, el último día).
// - biweekly: se genera los días 15 y último de cada mes; day_of_month va en null.
// Si es en USD, el tipo de cambio se toma el día de generación.
export const recurring = pgTable(
  'recurring',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: movementTypeEnum('type').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    amountOriginal: numeric('amount_original', { precision: 14, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    frequency: frequencyEnum('frequency').notNull(),
    dayOfMonth: smallint('day_of_month'),
    startOn: date('start_on').notNull(),
    endOn: date('end_on'),
    // Próxima fecha a generar; la mantiene el cron
    nextRunOn: date('next_run_on').notNull(),
    active: boolean('active').notNull().default(true),
    // Si es la cuota de una deuda, cada movimiento generado reduce su saldo
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'set null' }),
    ...syncColumns,
  },
  (t) => [
    index('recurring_next_run_idx')
      .on(t.nextRunOn)
      .where(sql`${t.active} AND ${t.deletedAt} IS NULL`),
    index('recurring_updated_at_idx').on(t.updatedAt),
    check('recurring_amount_positive', sql`${t.amountOriginal} > 0`),
    check('recurring_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check(
      'recurring_day_of_month_valid',
      sql`(${t.frequency} = 'monthly' AND ${t.dayOfMonth} BETWEEN 1 AND 31)
        OR (${t.frequency} = 'biweekly' AND ${t.dayOfMonth} IS NULL)`,
    ),
    check('recurring_dates_valid', sql`${t.endOn} IS NULL OR ${t.endOn} >= ${t.startOn}`),
  ],
);

export type Recurring = typeof recurring.$inferSelect;
export type NewRecurring = typeof recurring.$inferInsert;
