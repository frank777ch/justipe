import { computeDashboard, monthRange, type DashboardSummary } from '@justipe/shared';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { exchangeRates, movements, recurring } from '../db/schema/index.js';
import type { Database } from '../db/types.js';

// Resumen mensual del dashboard. Carga los datos del mes y delega el cálculo en
// computeDashboard (@justipe/shared), el mismo que usa la app cuando está offline.
// Las reglas del cálculo están documentadas allí.

export type { DashboardSummary };

export async function getDashboardSummary(db: Database, month: string, today: string): Promise<DashboardSummary> {
  const { from, to } = monthRange(month);

  const [monthMovements, activeRecurring, [latestRate]] = await Promise.all([
    db
      .select({
        type: movements.type,
        amountOriginal: movements.amountOriginal,
        amountPen: movements.amountPen,
        occurredOn: movements.occurredOn,
        recurringId: movements.recurringId,
        debtId: movements.debtId,
      })
      .from(movements)
      .where(and(isNull(movements.deletedAt), gte(movements.occurredOn, from), lte(movements.occurredOn, to))),
    db
      .select()
      .from(recurring)
      .where(and(eq(recurring.active, true), isNull(recurring.deletedAt), lte(recurring.nextRunOn, to))),
    db
      .select({ sell: exchangeRates.sell })
      .from(exchangeRates)
      .where(lte(exchangeRates.rateDate, today))
      .orderBy(desc(exchangeRates.rateDate))
      .limit(1),
  ]);

  return computeDashboard({
    month,
    today,
    movements: monthMovements,
    recurring: activeRecurring,
    usdRate: latestRate?.sell ?? null,
  });
}
