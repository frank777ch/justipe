import type { Currency, MovementType } from '@justipe/shared';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { categories, debts, exchangeRates, type Category, type Debt } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { ApiError } from '../lib/errors.js';

// Validaciones de referencias compartidas por movimientos, recurrentes y montos rápidos.

export async function requireCategory(db: Database, categoryId: string, expectedType: MovementType): Promise<Category> {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)));
  if (!category) {
    throw new ApiError(422, 'invalid_category', 'La categoría no existe');
  }
  if (category.type !== expectedType) {
    throw new ApiError(422, 'category_type_mismatch', `La categoría es de tipo "${category.type}" y el registro es "${expectedType}"`);
  }
  return category;
}

// Tipo de movimiento que representa un pago de cada dirección de deuda:
// lo que debo se paga con un gasto; lo que me deben se cobra con un ingreso.
export const PAYMENT_TYPE_BY_DIRECTION = {
  i_owe: 'expense',
  owed_to_me: 'income',
} as const satisfies Record<Debt['direction'], MovementType>;

export async function requireDebtForPayment(
  db: Database,
  debtId: string,
  payment: { type: MovementType; currency: Currency },
): Promise<Debt> {
  const [debt] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, debtId), isNull(debts.deletedAt)));
  if (!debt) {
    throw new ApiError(422, 'invalid_debt', 'La deuda no existe');
  }
  const expectedType = PAYMENT_TYPE_BY_DIRECTION[debt.direction];
  if (payment.type !== expectedType) {
    throw new ApiError(
      422,
      'debt_type_mismatch',
      debt.direction === 'i_owe'
        ? 'Los pagos de una deuda propia deben ser gastos'
        : 'Los cobros de una deuda a favor deben ser ingresos',
    );
  }
  if (payment.currency !== debt.currency) {
    throw new ApiError(422, 'debt_currency_mismatch', `La deuda está en ${debt.currency}; el pago debe estar en la misma moneda`);
  }
  return debt;
}

// Tipo de cambio a guardar en un movimiento:
// - PEN: siempre 1.
// - USD con TC enviado por la app: se respeta (edición manual).
// - USD sin TC: la tasa de venta del día o, si no hay, la última anterior.
export async function resolveExchangeRate(
  db: Database,
  currency: Currency,
  occurredOn: string,
  provided?: string,
): Promise<string> {
  if (currency === 'PEN') return '1.0000';
  if (provided !== undefined) return provided;
  const [rate] = await db
    .select({ sell: exchangeRates.sell })
    .from(exchangeRates)
    .where(lte(exchangeRates.rateDate, occurredOn))
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);
  if (!rate) {
    throw new ApiError(
      422,
      'exchange_rate_missing',
      `No hay tipo de cambio registrado para ${occurredOn} ni fechas anteriores; envía exchangeRate`,
    );
  }
  return rate.sell;
}
