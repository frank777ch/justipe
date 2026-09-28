import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { currencyEnum, debtDirectionEnum, syncColumns } from './common.js';

// Deudas en ambas direcciones.
// El saldo NO se guarda: se calcula como
//   initial_amount - Σ movements.amount_original (con debt_id = id y sin borrar)
// Así nunca se desincroniza. Los pagos/cobros deben estar en la moneda de la deuda
// (lo valida la API).
export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    direction: debtDirectionEnum('direction').notNull(),
    // Banco, tienda o persona
    counterparty: text('counterparty').notNull(),
    description: text('description'),
    initialAmount: numeric('initial_amount', { precision: 14, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    // Cuota mensual (normalmente solo en 'i_owe')
    installment: numeric('installment', { precision: 14, scale: 2 }),
    // Fecha estimada de pago (normalmente en 'owed_to_me')
    expectedOn: date('expected_on'),
    // Fecha en que se canceló por completo; null = vigente
    closedOn: date('closed_on'),
    ...syncColumns,
  },
  (t) => [
    index('debts_updated_at_idx').on(t.updatedAt),
    check('debts_initial_amount_positive', sql`${t.initialAmount} > 0`),
    check('debts_installment_positive', sql`${t.installment} IS NULL OR ${t.installment} > 0`),
    check('debts_counterparty_not_empty', sql`length(trim(${t.counterparty})) > 0`),
  ],
);

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
