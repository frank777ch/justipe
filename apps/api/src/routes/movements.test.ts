import { beforeEach, describe, expect, it } from 'vitest';
import { exchangeRates } from '../db/schema/index.js';
import { createCategory, setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

let foodId: string;
let salaryId: string;

beforeEach(async () => {
  foodId = await createCategory(ctx, 'Comida', 'expense');
  salaryId = await createCategory(ctx, 'Sueldo', 'income');
});

describe('movimientos', () => {
  it('gasto en soles: TC 1 y monto en soles igual al original', async () => {
    const response = await ctx.post('/movements', {
      type: 'expense',
      categoryId: foodId,
      amountOriginal: 13,
      occurredOn: '2026-09-28',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      currency: 'PEN',
      amountOriginal: '13.00',
      exchangeRate: '1.0000',
      amountPen: '13.00',
      recurringId: null,
      debtId: null,
    });
  });

  it('en soles ignora un TC distinto de 1', async () => {
    const response = await ctx.post('/movements', {
      type: 'expense',
      categoryId: foodId,
      amountOriginal: 10,
      currency: 'PEN',
      exchangeRate: 3.8,
      occurredOn: '2026-09-28',
    });
    expect(response.body.exchangeRate).toBe('1.0000');
  });

  it('en dólares con TC manual calcula el monto en soles', async () => {
    const response = await ctx.post('/movements', {
      type: 'expense',
      categoryId: foodId,
      amountOriginal: '10.00',
      currency: 'USD',
      exchangeRate: '3.7512',
      occurredOn: '2026-09-28',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ exchangeRate: '3.7512', amountPen: '37.51' });
  });

  it('en dólares sin TC usa la venta del día o la última anterior', async () => {
    await ctx.db.insert(exchangeRates).values([
      { rateDate: '2026-09-25', buy: '3.7400', sell: '3.7500' },
      { rateDate: '2026-09-28', buy: '3.7600', sell: '3.7700' },
    ]);
    const sameDay = await ctx.post('/movements', {
      type: 'expense', categoryId: foodId, amountOriginal: 100, currency: 'USD', occurredOn: '2026-09-28',
    });
    expect(sameDay.body).toMatchObject({ exchangeRate: '3.7700', amountPen: '377.00' });

    // Domingo 27: no hay tasa, se usa la del viernes 25
    const weekend = await ctx.post('/movements', {
      type: 'expense', categoryId: foodId, amountOriginal: 100, currency: 'USD', occurredOn: '2026-09-27',
    });
    expect(weekend.body).toMatchObject({ exchangeRate: '3.7500', amountPen: '375.00' });
  });

  it('en dólares sin TC ni tasas registradas responde 422', async () => {
    const response = await ctx.post('/movements', {
      type: 'expense', categoryId: foodId, amountOriginal: 5, currency: 'USD', occurredOn: '2026-09-28',
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('exchange_rate_missing');
  });

  it('la categoría debe existir y ser del mismo tipo', async () => {
    const mismatch = await ctx.post('/movements', {
      type: 'expense', categoryId: salaryId, amountOriginal: 5, occurredOn: '2026-09-28',
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('category_type_mismatch');

    const missing = await ctx.post('/movements', {
      type: 'expense', categoryId: '0192f000-0000-7000-8000-00000000dead', amountOriginal: 5, occurredOn: '2026-09-28',
    });
    expect(missing.body.error.code).toBe('invalid_category');
  });

  it('lista con filtros de fecha y tipo, del más reciente al más antiguo', async () => {
    const create = (type: 'expense' | 'income', categoryId: string, occurredOn: string, amountOriginal: number) =>
      ctx.post('/movements', { type, categoryId, amountOriginal, occurredOn });
    await create('expense', foodId, '2026-08-31', 1);
    await create('expense', foodId, '2026-09-01', 2);
    await create('income', salaryId, '2026-09-15', 3000);
    await create('expense', foodId, '2026-09-30', 4);
    await create('expense', foodId, '2026-10-01', 5);

    const september = await ctx.get('/movements?from=2026-09-01&to=2026-09-30');
    expect(september.body.map((m: { occurredOn: string }) => m.occurredOn)).toEqual(['2026-09-30', '2026-09-15', '2026-09-01']);

    const expenses = await ctx.get('/movements?from=2026-09-01&to=2026-09-30&type=expense');
    expect(expenses.body).toHaveLength(2);

    const page = await ctx.get('/movements?limit=2&offset=1');
    expect(page.body.map((m: { occurredOn: string }) => m.occurredOn)).toEqual(['2026-09-30', '2026-09-15']);
  });

  it('actualizar el monto recalcula el monto en soles', async () => {
    const created = await ctx.post('/movements', {
      type: 'expense', categoryId: foodId, amountOriginal: 10, currency: 'USD', exchangeRate: 3.5, occurredOn: '2026-09-28',
    });
    const updated = await ctx.patch(`/movements/${created.body.id}`, { amountOriginal: 20, note: 'cena' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ amountOriginal: '20.00', exchangeRate: '3.5000', amountPen: '70.00', note: 'cena' });
  });

  it('cambiar de USD a PEN fuerza TC 1', async () => {
    const created = await ctx.post('/movements', {
      type: 'expense', categoryId: foodId, amountOriginal: 10, currency: 'USD', exchangeRate: 3.5, occurredOn: '2026-09-28',
    });
    const updated = await ctx.patch(`/movements/${created.body.id}`, { currency: 'PEN' });
    expect(updated.body).toMatchObject({ currency: 'PEN', exchangeRate: '1.0000', amountPen: '10.00' });
  });

  it('cambiar el tipo sin cambiar la categoría se valida', async () => {
    const created = await ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal: 1, occurredOn: '2026-09-28' });
    const response = await ctx.patch(`/movements/${created.body.id}`, { type: 'income' });
    expect(response.status).toBe(422);
  });

  it('borrado lógico: desaparece del listado y ya no se puede editar', async () => {
    const created = await ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal: 1, occurredOn: '2026-09-28' });
    expect((await ctx.del(`/movements/${created.body.id}`)).status).toBe(204);
    expect((await ctx.get('/movements')).body).toHaveLength(0);
    expect((await ctx.patch(`/movements/${created.body.id}`, { amountOriginal: 2 })).status).toBe(404);
  });

  it('POST con id del cliente es idempotente; si fue borrado responde 409', async () => {
    const id = '0192f000-0000-7000-8000-000000000abc';
    const body = { id, type: 'expense', categoryId: foodId, amountOriginal: 4, occurredOn: '2026-09-28' };
    expect((await ctx.post('/movements', body)).status).toBe(201);
    expect((await ctx.post('/movements', body)).status).toBe(200);
    await ctx.del(`/movements/${id}`);
    const afterDelete = await ctx.post('/movements', body);
    expect(afterDelete.status).toBe(409);
    expect(afterDelete.body.error.code).toBe('already_deleted');
  });

  it('valida montos y fechas', async () => {
    const response = await ctx.post('/movements', {
      type: 'expense', categoryId: foodId, amountOriginal: -3, occurredOn: '2026-02-30',
    });
    expect(response.status).toBe(422);
    const paths = response.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['amountOriginal', 'occurredOn']));
  });
});
