import { describe, expect, it } from 'vitest';
import { createCategory, setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

describe('montos rápidos', () => {
  it('crea, ordena, actualiza y borra', async () => {
    await ctx.post('/quick-amounts', { amount: 13, sortOrder: 2 });
    const four = await ctx.post('/quick-amounts', { amount: 4, sortOrder: 1 });
    expect(four.status).toBe(201);

    const list = await ctx.get('/quick-amounts');
    expect(list.body.map((q: { amount: string }) => q.amount)).toEqual(['4.00', '13.00']);

    const updated = await ctx.patch(`/quick-amounts/${four.body.id}`, { amount: 2.46 });
    expect(updated.body.amount).toBe('2.46');

    expect((await ctx.del(`/quick-amounts/${four.body.id}`)).status).toBe(204);
    expect((await ctx.get('/quick-amounts')).body).toHaveLength(1);
  });

  it('la categoría asociada debe ser de gasto', async () => {
    const incomeId = await createCategory(ctx, 'Sueldo', 'income');
    const expenseId = await createCategory(ctx, 'Comida', 'expense');
    expect((await ctx.post('/quick-amounts', { amount: 6, categoryId: incomeId })).status).toBe(422);
    const ok = await ctx.post('/quick-amounts', { amount: 6, categoryId: expenseId });
    expect(ok.body.categoryId).toBe(expenseId);
  });
});
