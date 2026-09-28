import { zValidator } from '@hono/zod-validator';
import { debtCreateSchema, debtDirectionSchema, debtUpdateSchema } from '@justipe/shared';
import { and, asc, eq, getTableColumns, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { debts, movements } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { definedOnly, idParamValidator, resolveExistingOnCreate } from '../lib/crud.js';
import { notFound, validationHook } from '../lib/errors.js';

const listQuerySchema = z.object({
  direction: debtDirectionSchema.optional(),
  status: z.enum(['open', 'closed', 'all']).default('open'),
});

// Total pagado/cobrado: suma de los movimientos vivos asociados a la deuda
const paidAmount = sql<string>`coalesce(sum(${movements.amountOriginal}) filter (where ${movements.deletedAt} is null), 0)::numeric(14,2)`;

export function debtRoutes(db: Database) {
  // Deudas con su saldo calculado (initial_amount - pagado)
  const selectWithBalance = (where: SQL | undefined) =>
    db
      .select({
        ...getTableColumns(debts),
        paidAmount,
        balance: sql<string>`(${debts.initialAmount} - ${paidAmount})::numeric(14,2)`,
      })
      .from(debts)
      .leftJoin(movements, eq(movements.debtId, debts.id))
      .where(and(isNull(debts.deletedAt), where))
      .groupBy(debts.id);

  const findActive = async (id: string) => {
    const [row] = await selectWithBalance(eq(debts.id, id));
    return row;
  };

  return new Hono()
    .get('/', zValidator('query', listQuerySchema, validationHook), async (c) => {
      const { direction, status } = c.req.valid('query');
      const rows = await selectWithBalance(
        and(
          direction ? eq(debts.direction, direction) : undefined,
          status === 'open' ? isNull(debts.closedOn) : status === 'closed' ? isNotNull(debts.closedOn) : undefined,
        ),
      ).orderBy(asc(debts.direction), asc(debts.expectedOn), asc(debts.createdAt));
      return c.json(rows);
    })

    .get('/:id', idParamValidator, async (c) => {
      const row = await findActive(c.req.valid('param').id);
      if (!row) throw notFound('Deuda');
      return c.json(row);
    })

    .post('/', zValidator('json', debtCreateSchema, validationHook), async (c) => {
      const input = c.req.valid('json');
      const [created] = await db
        .insert(debts)
        .values({
          ...(input.id ? { id: input.id } : {}),
          direction: input.direction,
          counterparty: input.counterparty,
          description: input.description ?? null,
          initialAmount: input.initialAmount,
          currency: input.currency,
          installment: input.installment ?? null,
          expectedOn: input.expectedOn ?? null,
          closedOn: input.closedOn ?? null,
        })
        .onConflictDoNothing({ target: debts.id })
        .returning({ id: debts.id });

      const id = created?.id ?? input.id;
      if (!created) {
        const [existing] = input.id ? await db.select().from(debts).where(eq(debts.id, input.id)) : [];
        resolveExistingOnCreate(existing, 'Deuda');
      }
      const row = id ? await findActive(id) : undefined;
      if (!row) throw notFound('Deuda');
      return c.json(row, created ? 201 : 200);
    })

    .patch('/:id', idParamValidator, zValidator('json', debtUpdateSchema, validationHook), async (c) => {
      const { id } = c.req.valid('param');
      const changes = definedOnly(c.req.valid('json'));
      if (Object.keys(changes).length > 0) {
        const [updated] = await db
          .update(debts)
          .set(changes)
          .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
          .returning({ id: debts.id });
        if (!updated) throw notFound('Deuda');
      }
      const row = await findActive(id);
      if (!row) throw notFound('Deuda');
      return c.json(row);
    })

    // Borrado lógico: los pagos registrados se conservan como movimientos
    .delete('/:id', idParamValidator, async (c) => {
      const [deleted] = await db
        .update(debts)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(debts.id, c.req.valid('param').id), isNull(debts.deletedAt)))
        .returning({ id: debts.id });
      if (!deleted) throw notFound('Deuda');
      return c.body(null, 204);
    });
}
