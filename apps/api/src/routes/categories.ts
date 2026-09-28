import { zValidator } from '@hono/zod-validator';
import { categoryCreateSchema, categoryUpdateSchema, movementTypeSchema } from '@justipe/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { categories } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { definedOnly, idParamValidator, resolveExistingOnCreate } from '../lib/crud.js';
import { notFound, validationHook } from '../lib/errors.js';

const listQuerySchema = z.object({ type: movementTypeSchema.optional() });

export function categoryRoutes(db: Database) {
  const findActive = async (id: string) => {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)));
    return row;
  };

  return new Hono()
    .get('/', zValidator('query', listQuerySchema, validationHook), async (c) => {
      const { type } = c.req.valid('query');
      const rows = await db
        .select()
        .from(categories)
        .where(and(isNull(categories.deletedAt), type ? eq(categories.type, type) : undefined))
        .orderBy(asc(categories.type), asc(categories.sortOrder), asc(categories.name));
      return c.json(rows);
    })

    .get('/:id', idParamValidator, async (c) => {
      const row = await findActive(c.req.valid('param').id);
      if (!row) throw notFound('Categoría');
      return c.json(row);
    })

    .post('/', zValidator('json', categoryCreateSchema, validationHook), async (c) => {
      const input = c.req.valid('json');
      const [created] = await db
        .insert(categories)
        .values(definedOnly(input) as typeof categories.$inferInsert)
        .onConflictDoNothing({ target: categories.id })
        .returning();
      if (created) return c.json(created, 201);

      // Solo llega aquí si el id enviado ya existía
      const [existing] = input.id ? await db.select().from(categories).where(eq(categories.id, input.id)) : [];
      return c.json(resolveExistingOnCreate(existing, 'Categoría'), 200);
    })

    .patch('/:id', idParamValidator, zValidator('json', categoryUpdateSchema, validationHook), async (c) => {
      const { id } = c.req.valid('param');
      const changes = definedOnly(c.req.valid('json'));
      if (Object.keys(changes).length === 0) {
        const row = await findActive(id);
        if (!row) throw notFound('Categoría');
        return c.json(row);
      }
      const [updated] = await db
        .update(categories)
        .set(changes)
        .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
        .returning();
      if (!updated) throw notFound('Categoría');
      return c.json(updated);
    })

    // Borrado lógico: los movimientos existentes conservan su categoría
    .delete('/:id', idParamValidator, async (c) => {
      const [deleted] = await db
        .update(categories)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(categories.id, c.req.valid('param').id), isNull(categories.deletedAt)))
        .returning({ id: categories.id });
      if (!deleted) throw notFound('Categoría');
      return c.body(null, 204);
    });
}
