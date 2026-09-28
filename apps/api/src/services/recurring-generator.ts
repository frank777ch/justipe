import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import { movements, recurring, type Recurring } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { nextOccurrenceAfter } from '../lib/dates.js';
import { ApiError } from '../lib/errors.js';
import { resolveExchangeRate } from './references.js';

// Genera los movimientos de los recurrentes vencidos (next_run_on <= hoy).
// Es idempotente: el índice único (recurring_id, occurred_on) impide duplicados
// aunque se ejecute varias veces o en paralelo, y los periodos atrasados se
// ponen al día (p. ej. si la API estuvo apagada varios días).

// Tope de periodos por recurrente en una sola corrida (~2 años de quincenas)
const MAX_PERIODS_PER_RUN = 48;

export interface GenerationSummary {
  processed: number;
  generated: number;
  // Recurrentes que no se pudieron generar (p. ej. USD sin tipo de cambio); se reintentan en la próxima corrida
  skipped: Array<{ recurringId: string; name: string; date: string; reason: string }>;
}

export async function generateDueRecurring(db: Database, today: string): Promise<GenerationSummary> {
  const due = await db
    .select({ id: recurring.id })
    .from(recurring)
    .where(and(eq(recurring.active, true), isNull(recurring.deletedAt), lte(recurring.nextRunOn, today)))
    .orderBy(asc(recurring.nextRunOn));

  const summary: GenerationSummary = { processed: 0, generated: 0, skipped: [] };
  for (const { id } of due) {
    const result = await generateForRecurring(db, id, today);
    if (!result) continue;
    summary.processed += 1;
    summary.generated += result.generated;
    if (result.skipped) summary.skipped.push(result.skipped);
  }
  return summary;
}

// Procesa un recurrente dentro de una transacción con bloqueo de fila:
// dos ejecuciones simultáneas no pueden avanzar el mismo recurrente a la vez.
async function generateForRecurring(db: Database, id: string, today: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(recurring)
      .where(and(eq(recurring.id, id), eq(recurring.active, true), isNull(recurring.deletedAt), lte(recurring.nextRunOn, today)))
      .for('update', { skipLocked: true });
    // Ya lo tomó otra ejecución o dejó de estar vencido
    if (!item) return null;

    let generated = 0;
    let skipped: GenerationSummary['skipped'][number] | undefined;
    let date: string | null = item.nextRunOn;

    for (let i = 0; i < MAX_PERIODS_PER_RUN && date !== null && date <= today; i++) {
      if (item.endOn !== null && date > item.endOn) {
        date = null;
        break;
      }
      let exchangeRate: string;
      try {
        exchangeRate = await resolveExchangeRate(tx, item.currency, date);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        skipped = { recurringId: item.id, name: item.name, date, reason: error.message };
        break;
      }
      const inserted = await tx
        .insert(movements)
        .values(movementFor(item, date, exchangeRate))
        .onConflictDoNothing()
        .returning({ id: movements.id });
      generated += inserted.length;
      date = nextOccurrenceAfter(schedule(item), date);
    }

    // Se guarda desde dónde seguir. Si no quedan fechas, el recurrente termina.
    await tx
      .update(recurring)
      .set(date === null ? { active: false } : { nextRunOn: date })
      .where(eq(recurring.id, item.id));

    return { generated, skipped };
  });
}

function schedule(item: Recurring) {
  return { frequency: item.frequency, dayOfMonth: item.dayOfMonth, startOn: item.startOn, endOn: item.endOn };
}

function movementFor(item: Recurring, occurredOn: string, exchangeRate: string): typeof movements.$inferInsert {
  return {
    type: item.type,
    categoryId: item.categoryId,
    amountOriginal: item.amountOriginal,
    currency: item.currency,
    exchangeRate,
    occurredOn,
    note: item.name,
    recurringId: item.id,
    debtId: item.debtId,
  };
}
