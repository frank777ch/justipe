import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { movementTypeEnum, syncColumns } from './common.js';

// Categorías de gastos e ingresos.
// El id lo genera el cliente (UUIDv7) para poder crear registros offline;
// el default solo aplica a filas creadas por el servidor (seed, crons).
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: movementTypeEnum('type').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...syncColumns,
  },
  (t) => [
    // No se repite el nombre dentro del mismo tipo entre categorías vivas
    uniqueIndex('categories_type_name_uq')
      .on(t.type, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
    index('categories_updated_at_idx').on(t.updatedAt),
    check('categories_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('categories_color_hex', sql`${t.color} IS NULL OR ${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
