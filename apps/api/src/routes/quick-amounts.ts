import { zValidator } from '@hono/zod-validator';
import { quickAmountCreateSchema, quickAmountUpdateSchema } from '@justipe/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { quickAmounts } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { definedOnly, idParamValidator, resolveExistingOnCreate } from '../lib/crud.js';
import { notFound, validationHook } from '../lib/errors.js';
import { requireCategory } from '../services/references.js';

// Botones de montos frecuentes. Si tienen categoría, debe ser de gasto.
export function quickAmountRoutes(db: Database) {
  const findActive = async (id: string) => {
    const [row] = await db
      .select()
      .from(quickAmounts)
      .where(and(eq(quickAmounts.id, id), isNull(quickAmounts.deletedAt)));
    return row;
  };

  return new Hono()
    .get('/', async (c) => {
      const rows = await db
        .select()
        .from(quickAmounts)
        .where(isNull(quickAmounts.deletedAt))
        .orderBy(asc(quickAmounts.sortOrder), asc(quickAmounts.amount));
      return c.json(rows);
    })

    .post('/', zValidator('json', quickAmountCreateSchema, validationHook), async (c) => {
      const input = c.req.valid('json');
      if (input.categoryId) await requireCategory(db, input.categoryId, 'expense');

      const [created] = await db
        .insert(quickAmounts)
        .values({
          ...(input.id ? { id: input.id } : {}),
          amount: input.amount,
          currency: input.currency,
          categoryId: input.categoryId ?? null,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        })
        .onConflictDoNothing({ target: quickAmounts.id })
        .returning();
      if (created) return c.json(created, 201);

      const [existing] = input.id ? await db.select().from(quickAmounts).where(eq(quickAmounts.id, input.id)) : [];
      return c.json(resolveExistingOnCreate(existing, 'Monto rápido'), 200);
    })

    .patch('/:id', idParamValidator, zValidator('json', quickAmountUpdateSchema, validationHook), async (c) => {
      const { id } = c.req.valid('param');
      const existing = await findActive(id);
      if (!existing) throw notFound('Monto rápido');

      const changes = definedOnly(c.req.valid('json'));
      if (changes.categoryId) await requireCategory(db, changes.categoryId, 'expense');
      if (Object.keys(changes).length === 0) return c.json(existing);

      const [updated] = await db
        .update(quickAmounts)
        .set(changes)
        .where(and(eq(quickAmounts.id, id), isNull(quickAmounts.deletedAt)))
        .returning();
      if (!updated) throw notFound('Monto rápido');
      return c.json(updated);
    })

    .delete('/:id', idParamValidator, async (c) => {
      const [deleted] = await db
        .update(quickAmounts)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(quickAmounts.id, c.req.valid('param').id), isNull(quickAmounts.deletedAt)))
        .returning({ id: quickAmounts.id });
      if (!deleted) throw notFound('Monto rápido');
      return c.body(null, 204);
    });
}
