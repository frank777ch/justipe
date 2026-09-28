import type { Currency, MovementType } from '@justipe/shared';

// Formas de las respuestas de la API. Los montos llegan como strings decimales.

export interface Category {
  id: string;
  name: string;
  type: MovementType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

export interface Movement {
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
  createdAt: string;
}

export interface QuickAmount {
  id: string;
  amount: string;
  currency: Currency;
  categoryId: string | null;
  sortOrder: number;
}

export interface DashboardSummary {
  month: string;
  from: string;
  to: string;
  today: string;
  income: string;
  fixedExpenses: string;
  variableExpenses: string;
  totalExpenses: string;
  remaining: string;
  pendingIncome: string;
  pendingFixedExpenses: string;
  projectedRemaining: string;
  daysLeft: number;
  dailyBudget: string | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
}
