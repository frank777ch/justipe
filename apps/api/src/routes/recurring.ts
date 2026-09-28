import { zValidator } from '@hono/zod-validator';
import { recurringCreateSchema, recurringScheduleIssue, recurringUpdateSchema } from '@justipe/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { recurring, type Recurring } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { definedOnly, idParamValidator, resolveExistingOnCreate } from '../lib/crud.js';
import { maxDate, nextOccurrenceOnOrAfter, todayInLima, type Schedule } from '../lib/dates.js';
import { ApiError, notFound, validationHook } from '../lib/errors.js';
import { requireCategory, requireDebtForPayment } from '../services/references.js';

const SCHEDULE_FIELDS = ['frequency', 'dayOfMonth', 'startOn', 'endOn'] as const;

function scheduleOf(row: Pick<Recurring, 'frequency' | 'dayOfMonth' | 'startOn' | 'endOn'>): Schedule {
  return { frequency: row.frequency, dayOfMonth: row.dayOfMonth, startOn: row.startOn, endOn: row.endOn };
}

export function recurringRoutes(db: Database) {
  const findActive = async (id: string) => {
    const [row] = await db
      .select()
      .from(recurring)
      .where(and(eq(recurring.id, id), isNull(recurring.deletedAt)));
    return row;
  };

  return new Hono()
    .get('/', async (c) => {
      const rows = await db
        .select()
        .from(recurring)
        .where(isNull(recurring.deletedAt))
        .orderBy(asc(recurring.type), asc(recurring.nextRunOn), asc(recurring.name));
      return c.json(rows);
    })

    .get('/:id', idParamValidator, async (c) => {
      const row = await findActive(c.req.valid('param').id);
      if (!row) throw notFound('Recurrente');
      return c.json(row);
    })

    .post('/', zValidator('json', recurringCreateSchema, validationHook), async (c) => {
      const input = c.req.valid('json');
      await requireCategory(db, input.categoryId, input.type);
      if (input.debtId) {
        await requireDebtForPayment(db, input.debtId, { type: input.type, currency: input.currency });
      }

      const schedule: Schedule = {
        frequency: input.frequency,
        dayOfMonth: input.dayOfMonth ?? null,
        startOn: input.startOn,
        endOn: input.endOn ?? null,
      };
      // Se genera desde startOn: si startOn ya pasó, el cron crea los periodos atrasados
      const nextRunOn = nextOccurrenceOnOrAfter(schedule, input.startOn);
      if (!nextRunOn) {
        throw new ApiError(422, 'empty_schedule', 'Con esas fechas el recurrente no genera ningún movimiento');
      }

      const [created] = await db
        .insert(recurring)
        .values({
          ...(input.id ? { id: input.id } : {}),
          name: input.name,
          type: input.type,
          categoryId: input.categoryId,
          amountOriginal: input.amountOriginal,
          currency: input.currency,
          ...schedule,
          nextRunOn,
          active: input.active,
          debtId: input.debtId ?? null,
        })
        .onConflictDoNothing({ target: recurring.id })
        .returning();
      if (created) return c.json(created, 201);

      const [existing] = input.id ? await db.select().from(recurring).where(eq(recurring.id, input.id)) : [];
      return c.json(resolveExistingOnCreate(existing, 'Recurrente'), 200);
    })

    .patch('/:id', idParamValidator, zValidator('json', recurringUpdateSchema, validationHook), async (c) => {
      const { id } = c.req.valid('param');
      const existing = await findActive(id);
      if (!existing) throw notFound('Recurrente');

      const input = definedOnly(c.req.valid('json'));
      const merged = { ...existing, ...input };

      const issue = recurringScheduleIssue(scheduleOf(merged));
      if (issue) {
        throw new ApiError(422, 'validation_error', 'Datos inválidos', [issue]);
      }
      if (input.type !== undefined || input.categoryId !== undefined) {
        await requireCategory(db, merged.categoryId, merged.type);
      }
      if (merged.debtId && (input.debtId !== undefined || input.type !== undefined || input.currency !== undefined)) {
        await requireDebtForPayment(db, merged.debtId, { type: merged.type, currency: merged.currency });
      }

      // Si cambia el calendario, la próxima fecha se recalcula desde hoy para no
      // regenerar periodos pasados. Si ya no quedan fechas, se desactiva.
      const changes: Partial<typeof recurring.$inferInsert> = { ...input };
      if (SCHEDULE_FIELDS.some((field) => input[field] !== undefined)) {
        const next = nextOccurrenceOnOrAfter(scheduleOf(merged), maxDate(merged.startOn, todayInLima()));
        if (next) changes.nextRunOn = next;
        else changes.active = false;
      }

      const [updated] = await db
        .update(recurring)
        .set(changes)
        .where(and(eq(recurring.id, id), isNull(recurring.deletedAt)))
        .returning();
      if (!updated) throw notFound('Recurrente');
      return c.json(updated);
    })

    // Borrado lógico: los movimientos ya generados se conservan
    .delete('/:id', idParamValidator, async (c) => {
      const [deleted] = await db
        .update(recurring)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(recurring.id, c.req.valid('param').id), isNull(recurring.deletedAt)))
        .returning({ id: recurring.id });
      if (!deleted) throw notFound('Recurrente');
      return c.body(null, 204);
    });
}
