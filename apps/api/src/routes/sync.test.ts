import { computeDailyTotals, computeDebtBalances } from '@justipe/shared';
import { describe, expect, it } from 'vitest';
import { exchangeRates } from '../db/schema/index.js';
import { createCategory, setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

describe('GET /sync', () => {
  it('sin cursor devuelve la copia completa, solo con registros vivos', async () => {
    const foodId = await createCategory(ctx, 'Comida');
    const alive = await ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal: 4, occurredOn: '2026-09-28' });
    const deleted = await ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal: 6, occurredOn: '2026-09-28' });
    await ctx.del(`/movements/${deleted.body.id}`);
    await ctx.db.insert(exchangeRates).values({ rateDate: '2026-09-28', buy: '3.4160', sell: '3.4250' });

    const response = await ctx.get('/sync');
    expect(response.status).toBe(200);
    expect(response.body.full).toBe(true);
    expect(response.body.changes.categories).toHaveLength(1);
    expect(response.body.changes.movements.map((m: { id: string }) => m.id)).toEqual([alive.body.id]);
    expect(response.body.changes.exchangeRates).toHaveLength(1);
    expect(Date.parse(response.body.cursor)).not.toBeNaN();
  });

  it('con cursor devuelve solo lo que cambió, incluidos los borrados', async () => {
    const foodId = await createCategory(ctx, 'Comida');
    const old = await ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal: 4, occurredOn: '2026-09-01' });
    // El trigger fija updated_at = now(), así que se deja pasar tiempo real
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const since = new Date(Date.now() - 300).toISOString();
    const fresh = await ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal: 13, occurredOn: '2026-09-28' });
    await ctx.del(`/movements/${fresh.body.id}`);

    const response = await ctx.get(`/sync?since=${encodeURIComponent(since)}`);
    expect(response.body.full).toBe(false);
    const ids = response.body.changes.movements.map((m: { id: string }) => m.id);
    expect(ids).toContain(fresh.body.id);
    expect(ids).not.toContain(old.body.id);
    const freshRow = response.body.changes.movements.find((m: { id: string }) => m.id === fresh.body.id);
    expect(freshRow.deletedAt).not.toBeNull();
  });

  it('el cursor queda con margen hacia atrás (los repetidos son inofensivos)', async () => {
    const before = Date.now();
    const response = await ctx.get('/sync');
    expect(Date.parse(response.body.cursor)).toBeLessThan(before - 50_000);
  });

  it('valida el cursor y exige token', async () => {
    expect((await ctx.get('/sync?since=ayer')).status).toBe(422);
    expect((await ctx.request('GET', '/sync', undefined, null)).status).toBe(401);
  });
});

// Cálculos compartidos que usa la app offline (el dashboard se prueba en dashboard.test.ts)
describe('cálculos compartidos', () => {
  const movement = (overrides: Partial<Parameters<typeof computeDailyTotals>[0][number]>) => ({
    type: 'expense' as const,
    amountOriginal: '10.00',
    amountPen: '10.00',
    occurredOn: '2026-09-28',
    recurringId: null,
    debtId: null,
    deletedAt: null,
    ...overrides,
  });

  it('computeDailyTotals suma gastos e ingresos por día, solo del mes y sin borrados', () => {
    const totals = computeDailyTotals(
      [
        movement({ amountPen: '13.00' }),
        movement({ amountPen: '4.50' }),
        movement({ type: 'income', amountPen: '100.00' }),
        movement({ occurredOn: '2026-09-01', amountPen: '2.46' }),
        movement({ amountPen: '999.00', deletedAt: '2026-09-28T10:00:00Z' }),
        movement({ occurredOn: '2026-10-01', amountPen: '999.00' }),
      ],
      '2026-09',
    );
    expect(totals).toEqual({
      '2026-09-28': { expense: '17.50', income: '100.00', count: 3 },
      '2026-09-01': { expense: '2.46', income: '0.00', count: 1 },
    });
  });

  it('computeDebtBalances descuenta los pagos vivos en la moneda de la deuda', () => {
    const balances = computeDebtBalances(
      [
        { id: 'a', direction: 'i_owe', initialAmount: '1000.00' },
        { id: 'b', direction: 'owed_to_me', initialAmount: '300.00' },
      ],
      [
        movement({ debtId: 'a', amountOriginal: '450.00' }),
        movement({ debtId: 'a', amountOriginal: '450.00', deletedAt: new Date() }),
        movement({ debtId: 'b', type: 'income', amountOriginal: '100.00' }),
      ],
    );
    expect(balances).toEqual({
      a: { paidAmount: '450.00', balance: '550.00' },
      b: { paidAmount: '100.00', balance: '200.00' },
    });
  });
});
