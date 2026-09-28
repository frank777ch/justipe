import { sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories.js';
import { currencyEnum, syncColumns } from './common.js';

// Botones de montos frecuentes para el registro rápido de gastos.
// Sin categoría: toque en el monto + toque en la categoría (2 toques).
// Con categoría: se registra con un solo toque.
export const quickAmounts = pgTable(
  'quick_amounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull().default('PEN'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...syncColumns,
  },
  (t) => [
    index('quick_amounts_updated_at_idx').on(t.updatedAt),
    check('quick_amounts_amount_positive', sql`${t.amount} > 0`),
  ],
);

export type QuickAmount = typeof quickAmounts.$inferSelect;
export type NewQuickAmount = typeof quickAmounts.$inferInsert;
