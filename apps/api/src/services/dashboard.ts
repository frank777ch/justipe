import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { exchangeRates, movements, recurring } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { formatDate, lastDayOfMonth, maxDate, nextOccurrenceAfter, nextOccurrenceOnOrAfter, parseDate } from '../lib/dates.js';

// Resumen mensual del dashboard. Todos los montos en soles (amount_pen).
//
// - income / fixedExpenses / variableExpenses: movimientos reales del mes.
//   Fijo = generado por un recurrente (recurring_id); variable = el resto.
// - remaining: lo que queda hoy = ingresos - gastos.
// - pendingIncome / pendingFixedExpenses: recurrentes que todavía se van a
//   generar este mes (p. ej. el sueldo del 30 o el alquiler del 31).
// - projectedRemaining: lo que queda hoy menos los gastos fijos que aún faltan.
//   Los ingresos por venir NO se suman (criterio conservador): el sueldo del 30
//   todavía no está en tu bolsillo y suele cubrir el mes siguiente.
// - dailyBudget: projectedRemaining / días que quedan (incluido hoy). Solo para
//   el mes actual o futuros; en meses pasados es null.

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
const toCents = (value: string | number | null | undefined): number => Math.round(Number(value ?? 0) * 100);
const fromCents = (cents: number): string => (cents / 100).toFixed(2);

export function monthRange(month: string): { from: string; to: string; year: number; monthNumber: number } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return {
    from: formatDate(year, monthNumber, 1),
    to: formatDate(year, monthNumber, lastDayOfMonth(year, monthNumber)),
    year,
    monthNumber,
  };
}

export async function getDashboardSummary(db: Database, month: string, today: string): Promise<DashboardSummary> {
  const { from, to } = monthRange(month);

  const [totals] = await db
    .select({
      income: sql<string>`coalesce(sum(${movements.amountPen}) filter (where ${movements.type} = 'income'), 0)`,
      fixed: sql<string>`coalesce(sum(${movements.amountPen}) filter (where ${movements.type} = 'expense' and ${movements.recurringId} is not null), 0)`,
      variable: sql<string>`coalesce(sum(${movements.amountPen}) filter (where ${movements.type} = 'expense' and ${movements.recurringId} is null), 0)`,
    })
    .from(movements)
    .where(and(isNull(movements.deletedAt), gte(movements.occurredOn, from), lte(movements.occurredOn, to)));

  const pending = await pendingRecurring(db, from, to, today);

  const income = toCents(totals?.income);
  const fixed = toCents(totals?.fixed);
  const variable = toCents(totals?.variable);
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

// Suma de los periodos de recurrentes activos que aún no se generaron dentro del mes.
// En USD se usa la última tasa de venta conocida.
async function pendingRecurring(db: Database, from: string, to: string, today: string) {
  const result = { income: 0, expense: 0 };
  if (to < today) return result;

  const items = await db
    .select()
    .from(recurring)
    .where(and(eq(recurring.active, true), isNull(recurring.deletedAt), lte(recurring.nextRunOn, to)));
  if (items.length === 0) return result;

  let usdRate: number | null = null;
  if (items.some((item) => item.currency === 'USD')) {
    const [rate] = await db
      .select({ sell: exchangeRates.sell })
      .from(exchangeRates)
      .where(lte(exchangeRates.rateDate, today))
      .orderBy(desc(exchangeRates.rateDate))
      .limit(1);
    usdRate = rate ? Number(rate.sell) : null;
  }

  for (const item of items) {
    const schedule = { frequency: item.frequency, dayOfMonth: item.dayOfMonth, startOn: item.startOn, endOn: item.endOn };
    const rate = item.currency === 'PEN' ? 1 : usdRate;
    if (rate === null) continue;
    const amount = Math.round(Number(item.amountOriginal) * rate * 100);

    let date = nextOccurrenceOnOrAfter(schedule, maxDate(item.nextRunOn, from));
    while (date !== null && date <= to) {
      if (item.type === 'income') result.income += amount;
      else result.expense += amount;
      date = nextOccurrenceAfter(schedule, date);
    }
  }
  return result;
}
