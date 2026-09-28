import { zValidator } from '@hono/zod-validator';
import { movementCreateSchema, movementListQuerySchema, movementUpdateSchema } from '@justipe/shared';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { movements } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { definedOnly, idParamValidator, resolveExistingOnCreate } from '../lib/crud.js';
import { notFound, validationHook } from '../lib/errors.js';
import { requireCategory, requireDebtForPayment, resolveExchangeRate } from '../services/references.js';

export function movementRoutes(db: Database) {
  const findActive = async (id: string) => {
    const [row] = await db
      .select()
      .from(movements)
      .where(and(eq(movements.id, id), isNull(movements.deletedAt)));
    return row;
  };

  return new Hono()
    // Listado paginado, del más reciente al más antiguo
    .get('/', zValidator('query', movementListQuerySchema, validationHook), async (c) => {
      const query = c.req.valid('query');
      const rows = await db
        .select()
        .from(movements)
        .where(
          and(
            isNull(movements.deletedAt),
            query.from ? gte(movements.occurredOn, query.from) : undefined,
            query.to ? lte(movements.occurredOn, query.to) : undefined,
            query.type ? eq(movements.type, query.type) : undefined,
            query.categoryId ? eq(movements.categoryId, query.categoryId) : undefined,
            query.debtId ? eq(movements.debtId, query.debtId) : undefined,
          ),
        )
        .orderBy(desc(movements.occurredOn), desc(movements.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return c.json(rows);
    })

    .get('/:id', idParamValidator, async (c) => {
      const row = await findActive(c.req.valid('param').id);
      if (!row) throw notFound('Movimiento');
      return c.json(row);
    })

    .post('/', zValidator('json', movementCreateSchema, validationHook), async (c) => {
      const input = c.req.valid('json');
      await requireCategory(db, input.categoryId, input.type);
      if (input.debtId) {
        await requireDebtForPayment(db, input.debtId, { type: input.type, currency: input.currency });
      }
      const exchangeRate = await resolveExchangeRate(db, input.currency, input.occurredOn, input.exchangeRate);

      const [created] = await db
        .insert(movements)
        .values({
          ...(input.id ? { id: input.id } : {}),
          type: input.type,
          categoryId: input.categoryId,
          amountOriginal: input.amountOriginal,
          currency: input.currency,
          exchangeRate,
          occurredOn: input.occurredOn,
          note: input.note ?? null,
          debtId: input.debtId ?? null,
        })
        .onConflictDoNothing({ target: movements.id })
        .returning();
      if (created) return c.json(created, 201);

      const [existing] = input.id ? await db.select().from(movements).where(eq(movements.id, input.id)) : [];
      return c.json(resolveExistingOnCreate(existing, 'Movimiento'), 200);
    })

    .patch('/:id', idParamValidator, zValidator('json', movementUpdateSchema, validationHook), async (c) => {
      const { id } = c.req.valid('param');
      const existing = await findActive(id);
      if (!existing) throw notFound('Movimiento');

      const input = definedOnly(c.req.valid('json'));
      const merged = { ...existing, ...input };

      // Se revalida solo lo que puede haber quedado incoherente con el cambio
      if (input.type !== undefined || input.categoryId !== undefined) {
        await requireCategory(db, merged.categoryId, merged.type);
      }
      if (merged.debtId && (input.debtId !== undefined || input.type !== undefined || input.currency !== undefined)) {
        await requireDebtForPayment(db, merged.debtId, { type: merged.type, currency: merged.currency });
      }

      // El TC se conserva salvo que cambie la moneda o se envíe uno nuevo
      let exchangeRate = existing.exchangeRate;
      if (merged.currency === 'PEN') {
        exchangeRate = '1.0000';
      } else if (input.exchangeRate !== undefined) {
        exchangeRate = input.exchangeRate;
      } else if (existing.currency !== merged.currency) {
        exchangeRate = await resolveExchangeRate(db, merged.currency, merged.occurredOn);
      }

      const [updated] = await db
        .update(movements)
        .set({ ...input, exchangeRate })
        .where(and(eq(movements.id, id), isNull(movements.deletedAt)))
        .returning();
      if (!updated) throw notFound('Movimiento');
      return c.json(updated);
    })

    .delete('/:id', idParamValidator, async (c) => {
      const [deleted] = await db
        .update(movements)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(movements.id, c.req.valid('param').id), isNull(movements.deletedAt)))
        .returning({ id: movements.id });
      if (!deleted) throw notFound('Movimiento');
      return c.body(null, 204);
    });
}
