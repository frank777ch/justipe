import type { Currency, DebtDirection, Frequency, MovementType } from '@justipe/shared';

export type { DashboardSummary } from '@justipe/shared';

// Formas de los registros tal como llegan de la API (montos como strings decimales,
// fechas de auditoría como ISO). En el teléfono se guardan igual, más la marca
// "_pending" cuando el cambio local aún no llegó al servidor.

interface SyncFields {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Solo local: creado o modificado offline y todavía sin confirmar por el servidor
  _pending?: boolean;
}

export interface Category extends SyncFields {
  id: string;
  name: string;
  type: MovementType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

export interface Movement extends SyncFields {
  id: string;
  type: MovementType;
  categoryId: string;
  amountOriginal: string;
  currency: Currency;
  exchangeRate: string;
  amountPen: string;
  occurredOn: string;
  note: string | null;
  recurringId: string | null;
  debtId: string | null;
}

export interface QuickAmount extends SyncFields {
  id: string;
  amount: string;
  currency: Currency;
  categoryId: string | null;
  sortOrder: number;
}

export interface Recurring extends SyncFields {
  id: string;
  name: string;
  type: MovementType;
  categoryId: string;
  amountOriginal: string;
  currency: Currency;
  frequency: Frequency;
  dayOfMonth: number | null;
  startOn: string;
  endOn: string | null;
  nextRunOn: string;
  active: boolean;
  debtId: string | null;
}

export interface Debt extends SyncFields {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  description: string | null;
  initialAmount: string;
  currency: Currency;
  installment: string | null;
  expectedOn: string | null;
  closedOn: string | null;
}

export interface ExchangeRate {
  rateDate: string;
  buy: string;
  sell: string;
  source: 'api' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
}

export interface SyncResponse {
  full: boolean;
  cursor: string;
  changes: {
    categories: Category[];
    movements: Movement[];
    recurring: Recurring[];
    debts: Debt[];
    quickAmounts: QuickAmount[];
    exchangeRates: ExchangeRate[];
  };
}
