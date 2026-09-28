import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { rateSourceEnum } from './common.js';

// Tipo de cambio USD → PEN por día.
// El cron diario (fase 3) inserta la tasa de apis.net.pe con source = 'api'.
// Si la editas a mano pasa a source = 'manual' y el cron ya no la sobrescribe.
// Por defecto los movimientos en USD usan la tasa de venta ("sell") del día o, si
// ese día no hay tasa (fines de semana, feriados), la última disponible.
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    rateDate: date('rate_date').primaryKey(),
    buy: numeric('buy', { precision: 10, scale: 4 }).notNull(),
    sell: numeric('sell', { precision: 10, scale: 4 }).notNull(),
    source: rateSourceEnum('source').notNull().default('api'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('exchange_rates_updated_at_idx').on(t.updatedAt),
    check('exchange_rates_buy_positive', sql`${t.buy} > 0`),
    check('exchange_rates_sell_positive', sql`${t.sell} > 0`),
  ],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
