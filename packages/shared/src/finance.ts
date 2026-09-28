import { formatDate, lastDayOfMonth, maxDate, nextOccurrenceAfter, nextOccurrenceOnOrAfter, parseDate } from './dates.js';
import type { Currency, DebtDirection, Frequency, MovementType } from './primitives.js';

// Cálculos financieros puros (sin BD ni red). Los usan la API y la app offline,
// así ambos lados muestran exactamente los mismos números.

// Datos mínimos que necesitan los cálculos (compatibles con las filas de la API)
export interface MovementLike {
  type: MovementType;
  amountOriginal: string;
  amountPen: string;
  occurredOn: string;
  recurringId: string | null;
  debtId: string | null;
  deletedAt?: string | Date | null;
}

export interface RecurringLike {
  type: MovementType;
  amountOriginal: string;
  currency: Currency;
  frequency: Frequency;
  dayOfMonth: number | null;
  startOn: string;
  endOn: string | null;
  nextRunOn: string;
  active: boolean;
  deletedAt?: string | Date | null;
}

export interface DebtLike {
  id: string;
  direction: DebtDirection;
  initialAmount: string;
  deletedAt?: string | Date | null;
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

// Aritmética en céntimos (enteros) para no arrastrar errores de coma flotante
export const toCents = (value: string | number | null | undefined): number => Math.round(Number(value ?? 0) * 100);
export const fromCents = (cents: number): string => (cents / 100).toFixed(2);

const isAlive = (row: { deletedAt?: string | Date | null }) => row.deletedAt == null;

export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return {
    from: formatDate(year, monthNumber, 1),
    to: formatDate(year, monthNumber, lastDayOfMonth(year, monthNumber)),
  };
}

// Resumen mensual del dashboard. Todos los montos en soles (amount_pen).
//
// - income / fixedExpenses / variableExpenses: movimientos reales del mes.
//   Fijo = generado por un recurrente (recurringId); variable = el resto.
// - remaining: lo que queda hoy = ingresos - gastos.
// - pendingIncome / pendingFixedExpenses: recurrentes que todavía se van a
//   generar este mes (p. ej. el sueldo del 30 o el alquiler del 31).
// - projectedRemaining: lo que queda hoy menos los gastos fijos que aún faltan.
//   Los ingresos por venir NO se suman (criterio conservador): el sueldo del 30
//   todavía no está en tu bolsillo y suele cubrir el mes siguiente.
// - dailyBudget: projectedRemaining / días que quedan (incluido hoy). Solo para
//   el mes actual o futuros; en meses pasados es null.
export function computeDashboard(input: {
  month: string;
  today: string;
  movements: MovementLike[];
  recurring: RecurringLike[];
  // Última tasa de venta USD conocida (para recurrentes en USD por venir)
  usdRate: string | null;
}): DashboardSummary {
  const { month, today } = input;
  const { from, to } = monthRange(month);

  let income = 0;
  let fixed = 0;
  let variable = 0;
  for (const movement of input.movements) {
    if (!isAlive(movement) || movement.occurredOn < from || movement.occurredOn > to) continue;
    const cents = toCents(movement.amountPen);
    if (movement.type === 'income') income += cents;
    else if (movement.recurringId) fixed += cents;
    else variable += cents;
  }

  const pending = pendingRecurring(input.recurring, from, to, today, input.usdRate);
  const remaining = income - fixed - variable;
  const projected = remaining - pending.expense;

  const daysLeft = today > to ? 0 : today < from ? parseDate(to).day : parseDate(to).day - parseDate(today).day + 1;
  // Se redondea hacia abajo: mejor quedarse corto que pasarse
  const dailyBudget = daysLeft === 0 ? null : fromCents(Math.max(0, Math.floor(projected / daysLeft)));

  return {
    month,
    from,
    to,
    today,
    income: fromCents(income),
    fixedExpenses: fromCents(fixed),
    variableExpenses: fromCents(variable),
    totalExpenses: fromCents(fixed + variable),
    remaining: fromCents(remaining),
    pendingIncome: fromCents(pending.income),
    pendingFixedExpenses: fromCents(pending.expense),
    projectedRemaining: fromCents(projected),
    daysLeft,
    dailyBudget,
  };
}

// Suma (en céntimos) de los periodos de recurrentes activos que aún no se generaron dentro del mes
function pendingRecurring(items: RecurringLike[], from: string, to: string, today: string, usdRate: string | null) {
  const result = { income: 0, expense: 0 };
  if (to < today) return result;

  for (const item of items) {
    if (!item.active || !isAlive(item) || item.nextRunOn > to) continue;
    const rate = item.currency === 'PEN' ? 1 : usdRate === null ? null : Number(usdRate);
    if (rate === null) continue;
    const amount = Math.round(Number(item.amountOriginal) * rate * 100);

    const schedule = { frequency: item.frequency, dayOfMonth: item.dayOfMonth, startOn: item.startOn, endOn: item.endOn };
    let date = nextOccurrenceOnOrAfter(schedule, maxDate(item.nextRunOn, from));
    while (date !== null && date <= to) {
      if (item.type === 'income') result.income += amount;
      else result.expense += amount;
      date = nextOccurrenceAfter(schedule, date);
    }
  }
  return result;
}

export interface DayTotals {
  expense: string;
  income: string;
  count: number;
}

// Totales por día de un mes para el calendario (en soles)
export function computeDailyTotals(movements: MovementLike[], month: string): Record<string, DayTotals> {
  const { from, to } = monthRange(month);
  const cents: Record<string, { expense: number; income: number; count: number }> = {};
  for (const movement of movements) {
    if (!isAlive(movement) || movement.occurredOn < from || movement.occurredOn > to) continue;
    const day = (cents[movement.occurredOn] ??= { expense: 0, income: 0, count: 0 });
    day[movement.type] += toCents(movement.amountPen);
    day.count += 1;
  }
  return Object.fromEntries(
    Object.entries(cents).map(([date, day]) => [date, { expense: fromCents(day.expense), income: fromCents(day.income), count: day.count }]),
  );
}

export interface DebtBalance {
  paidAmount: string;
  balance: string;
}

// Saldo de cada deuda: monto inicial menos los pagos/cobros vivos asociados (en su moneda)
export function computeDebtBalances(debts: DebtLike[], movements: MovementLike[]): Record<string, DebtBalance> {
  const paid: Record<string, number> = {};
  for (const movement of movements) {
    if (!movement.debtId || !isAlive(movement)) continue;
    paid[movement.debtId] = (paid[movement.debtId] ?? 0) + toCents(movement.amountOriginal);
  }
  return Object.fromEntries(
    debts.map((debt) => {
      const paidCents = paid[debt.id] ?? 0;
      return [debt.id, { paidAmount: fromCents(paidCents), balance: fromCents(toCents(debt.initialAmount) - paidCents) }];
    }),
  );
}
