import type { Currency, DebtDirection, MovementType } from '@justipe/shared';
import { randomUUID } from 'expo-crypto';
import type { Debt, Movement, QuickAmount } from '../api/types';
import { localDb } from './localDb';
import { outbox } from './outbox';
import { syncEngine } from './syncEngine';

// Cambios hechos en el teléfono. Todos siguen el mismo patrón:
//   1) se escriben en la copia local (la UI se actualiza al instante, con o sin red)
//   2) se encolan en el outbox para enviarlos al servidor cuando haya conexión.

export class LocalValidationError extends Error {}

const nowIso = () => new Date().toISOString();

function afterLocalChange(): void {
  syncEngine.touch();
}

// Tipo de cambio para un movimiento en USD: el indicado o el de venta del día (o el último anterior)
export function resolveLocalRate(currency: Currency, occurredOn: string, provided?: string): string {
  if (currency === 'PEN') return '1.0000';
  if (provided) return provided;
  const rate = localDb
    .all('exchangeRates')
    .filter((r) => r.rateDate <= occurredOn)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
  if (!rate) {
    throw new LocalValidationError('No hay tipo de cambio guardado para esa fecha; ingrésalo a mano');
  }
  return rate.sell;
}

const roundPen = (amount: string, rate: string) => (Math.round(Number(amount) * Number(rate) * 100) / 100).toFixed(2);

export interface NewMovementInput {
  type: MovementType;
  categoryId: string;
  amountOriginal: string;
  currency: Currency;
  exchangeRate?: string;
  occurredOn: string;
  note?: string | null;
  debtId?: string | null;
}

export function createMovement(input: NewMovementInput): Movement {
  const category = localDb.get('categories', input.categoryId);
  if (!category || category.deletedAt) throw new LocalValidationError('La categoría no existe');
  if (category.type !== input.type) throw new LocalValidationError('La categoría no corresponde al tipo de movimiento');

  const exchangeRate = resolveLocalRate(input.currency, input.occurredOn, input.exchangeRate);
  const timestamp = nowIso();
  const movement: Movement = {
    id: randomUUID(),
    type: input.type,
    categoryId: input.categoryId,
    amountOriginal: input.amountOriginal,
    currency: input.currency,
    exchangeRate,
    amountPen: roundPen(input.amountOriginal, exchangeRate),
    occurredOn: input.occurredOn,
    note: input.note ?? null,
    recurringId: null,
    debtId: input.debtId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    _pending: true,
  };
  localDb.put('movements', movement);
  outbox.enqueue({
    kind: 'create',
    table: 'movements',
    id: movement.id,
    payload: {
      type: movement.type,
      categoryId: movement.categoryId,
      amountOriginal: movement.amountOriginal,
      currency: movement.currency,
      // Se envía el TC usado localmente para que servidor y teléfono calculen igual
      ...(movement.currency === 'USD' ? { exchangeRate } : {}),
      occurredOn: movement.occurredOn,
      note: movement.note,
      debtId: movement.debtId,
    },
  });
  afterLocalChange();
  return movement;
}

// Borrado lógico genérico
function softDelete(table: 'movements' | 'debts' | 'quickAmounts', id: string): void {
  const row = localDb.get(table, id);
  if (!row) return;
  const result = outbox.enqueue({ kind: 'delete', table, id });
  if (result === 'discarded') localDb.remove(table, id);
  else localDb.put(table, { ...row, deletedAt: nowIso(), _pending: true });
  afterLocalChange();
}

export const deleteMovement = (id: string) => softDelete('movements', id);

export interface NewDebtInput {
  direction: DebtDirection;
  counterparty: string;
  description: string | null;
  initialAmount: string;
  currency: Currency;
  installment: string | null;
  expectedOn: string | null;
}

export function createDebt(input: NewDebtInput): Debt {
  const timestamp = nowIso();
  const debt: Debt = {
    id: randomUUID(),
    ...input,
    closedOn: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    _pending: true,
  };
  localDb.put('debts', debt);
  outbox.enqueue({ kind: 'create', table: 'debts', id: debt.id, payload: { ...input } });
  afterLocalChange();
  return debt;
}

export type DebtChanges = Partial<Pick<Debt, 'counterparty' | 'description' | 'initialAmount' | 'installment' | 'expectedOn' | 'closedOn'>>;

export function updateDebt(id: string, changes: DebtChanges): void {
  const debt = localDb.get('debts', id);
  if (!debt || debt.deletedAt) throw new LocalValidationError('La deuda no existe');
  localDb.put('debts', { ...debt, ...changes, updatedAt: nowIso(), _pending: true });
  outbox.enqueue({ kind: 'update', table: 'debts', id, payload: changes });
  afterLocalChange();
}

export const deleteDebt = (id: string) => softDelete('debts', id);

export function createQuickAmount(input: { amount: string; currency: Currency; categoryId: string | null; sortOrder: number }): QuickAmount {
  const timestamp = nowIso();
  const quickAmount: QuickAmount = {
    id: randomUUID(),
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    _pending: true,
  };
  localDb.put('quickAmounts', quickAmount);
  outbox.enqueue({ kind: 'create', table: 'quickAmounts', id: quickAmount.id, payload: { ...input } });
  afterLocalChange();
  return quickAmount;
}

export const deleteQuickAmount = (id: string) => softDelete('quickAmounts', id);
