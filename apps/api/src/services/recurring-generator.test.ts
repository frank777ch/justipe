import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { exchangeRates, movements, recurring } from '../db/schema/index.js';
import { createCategory, setupTestContext } from '../test/helpers.js';
import { generateDueRecurring } from './recurring-generator.js';

const ctx = await setupTestContext();

let rentId: string;
let salaryId: string;
let debtCategoryId: string;

beforeEach(async () => {
  rentId = await createCategory(ctx, 'Vivienda', 'expense');
  salaryId = await createCategory(ctx, 'Sueldo', 'income');
  debtCategoryId = await createCategory(ctx, 'Deudas', 'expense');
});

async function createRecurring(body: Record<string, unknown>) {
  const response = await ctx.post('/recurring', body);
  if (response.status !== 201) throw new Error(JSON.stringify(response.body));
  return response.body as { id: string };
}

async function movementDates(recurringId: string) {
  const rows = await ctx.db.select().from(movements).where(eq(movements.recurringId, recurringId)).orderBy(movements.occurredOn);
  return rows.map((row) => row.occurredOn);
}

async function recurringRow(id: string) {
  const [row] = await ctx.db.select().from(recurring).where(eq(recurring.id, id));
  return row!;
}

describe('generateDueRecurring', () => {
  it('genera los periodos atrasados hasta hoy y deja la próxima fecha lista', async () => {
    const rent = await createRecurring({
      name: 'Alquiler', type: 'expense', categoryId: rentId, amountOriginal: 1200, frequency: 'monthly', dayOfMonth: 31, startOn: '2026-01-01',
    });

    const summary = await generateDueRecurring(ctx.db, '2026-04-15');
    expect(summary).toMatchObject({ processed: 1, generated: 3, skipped: [] });
    expect(await movementDates(rent.id)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect((await recurringRow(rent.id)).nextRunOn).toBe('2026-04-30');
  });

  it('los movimientos generados copian monto, categoría y quedan marcados como fijos', async () => {
    const rent = await createRecurring({
      name: 'Alquiler', type: 'expense', categoryId: rentId, amountOriginal: 1200, frequency: 'monthly', dayOfMonth: 1, startOn: '2026-09-01',
    });
    await generateDueRecurring(ctx.db, '2026-09-01');
    const [movement] = await ctx.db.select().from(movements).where(eq(movements.recurringId, rent.id));
    expect(movement).toMatchObject({
      type: 'expense',
      categoryId: rentId,
      amountOriginal: '1200.00',
      currency: 'PEN',
      exchangeRate: '1.0000',
      amountPen: '1200.00',
      occurredOn: '2026-09-01',
      note: 'Alquiler',
      recurringId: rent.id,
    });
  });

  it('quincenal genera el 15 y el último día', async () => {
    const salary = await createRecurring({
      name: 'Sueldo', type: 'income', categoryId: salaryId, amountOriginal: 2500, frequency: 'biweekly', startOn: '2026-09-01',
    });
    await generateDueRecurring(ctx.db, '2026-10-20');
    expect(await movementDates(salary.id)).toEqual(['2026-09-15', '2026-09-30', '2026-10-15']);
    expect((await recurringRow(salary.id)).nextRunOn).toBe('2026-10-31');
  });

  it('es idempotente: correrlo dos veces no duplica', async () => {
    const salary = await createRecurring({
      name: 'Sueldo', type: 'income', categoryId: salaryId, amountOriginal: 2500, frequency: 'biweekly', startOn: '2026-09-01',
    });
    await generateDueRecurring(ctx.db, '2026-09-30');
    const second = await generateDueRecurring(ctx.db, '2026-09-30');
    expect(second.generated).toBe(0);
    expect(await movementDates(salary.id)).toEqual(['2026-09-15', '2026-09-30']);
  });

  it('dos corridas en paralelo tampoco duplican', async () => {
    const salary = await createRecurring({
      name: 'Sueldo', type: 'income', categoryId: salaryId, amountOriginal: 2500, frequency: 'biweekly', startOn: '2026-01-01',
    });
    const results = await Promise.all([generateDueRecurring(ctx.db, '2026-06-30'), generateDueRecurring(ctx.db, '2026-06-30')]);
    expect(results[0]!.generated + results[1]!.generated).toBe(12);
    expect(await movementDates(salary.id)).toHaveLength(12);
  });

  it('un movimiento generado y luego borrado no vuelve a aparecer', async () => {
    const rent = await createRecurring({
      name: 'Alquiler', type: 'expense', categoryId: rentId, amountOriginal: 1200, frequency: 'monthly', dayOfMonth: 5, startOn: '2026-09-01',
    });
    await generateDueRecurring(ctx.db, '2026-09-10');
    const [movement] = await ctx.db.select().from(movements).where(eq(movements.recurringId, rent.id));
    await ctx.del(`/movements/${movement!.id}`);

    // Aunque se retroceda la próxima fecha, el índice único impide recrearlo
    await ctx.db.update(recurring).set({ nextRunOn: '2026-09-05' }).where(eq(recurring.id, rent.id));
    expect((await generateDueRecurring(ctx.db, '2026-09-10')).generated).toBe(0);
  });

  it('respeta endOn y desactiva el recurrente al terminar', async () => {
    const gym = await createRecurring({
      name: 'Gym', type: 'expense', categoryId: rentId, amountOriginal: 100, frequency: 'monthly', dayOfMonth: 10, startOn: '2026-01-01', endOn: '2026-03-15',
    });
    await generateDueRecurring(ctx.db, '2026-12-31');
    expect(await movementDates(gym.id)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect((await recurringRow(gym.id)).active).toBe(false);
  });

  it('ignora recurrentes inactivos, borrados o futuros', async () => {
    const inactive = await createRecurring({
      name: 'Inactivo', type: 'expense', categoryId: rentId, amountOriginal: 1, frequency: 'monthly', dayOfMonth: 1, startOn: '2026-01-01', active: false,
    });
    const deleted = await createRecurring({
      name: 'Borrado', type: 'expense', categoryId: rentId, amountOriginal: 1, frequency: 'monthly', dayOfMonth: 1, startOn: '2026-01-01',
    });
    await ctx.del(`/recurring/${deleted.id}`);
    await createRecurring({
      name: 'Futuro', type: 'expense', categoryId: rentId, amountOriginal: 1, frequency: 'monthly', dayOfMonth: 1, startOn: '2027-01-01',
    });

    const summary = await generateDueRecurring(ctx.db, '2026-09-28');
    expect(summary).toEqual({ processed: 0, generated: 0, skipped: [] });
    expect(await movementDates(inactive.id)).toEqual([]);
  });

  it('en USD usa el tipo de cambio de cada fecha', async () => {
    await ctx.db.insert(exchangeRates).values([
      { rateDate: '2026-08-31', buy: '3.5000', sell: '3.5100' },
      { rateDate: '2026-09-15', buy: '3.6000', sell: '3.6200' },
    ]);
    const netflix = await createRecurring({
      name: 'Streaming', type: 'expense', categoryId: rentId, amountOriginal: 10, currency: 'USD', frequency: 'monthly', dayOfMonth: 1, startOn: '2026-09-01',
    });
    await generateDueRecurring(ctx.db, '2026-10-01');
    const rows = await ctx.db.select().from(movements).where(eq(movements.recurringId, netflix.id)).orderBy(movements.occurredOn);
    expect(rows.map((r) => [r.occurredOn, r.exchangeRate, r.amountPen])).toEqual([
      ['2026-09-01', '3.5100', '35.10'],
      ['2026-10-01', '3.6200', '36.20'],
    ]);
  });

  it('en USD sin tipo de cambio lo deja pendiente y lo reintenta después', async () => {
    const netflix = await createRecurring({
      name: 'Streaming', type: 'expense', categoryId: rentId, amountOriginal: 10, currency: 'USD', frequency: 'monthly', dayOfMonth: 1, startOn: '2026-09-01',
    });
    const first = await generateDueRecurring(ctx.db, '2026-09-02');
    expect(first.generated).toBe(0);
    expect(first.skipped).toEqual([expect.objectContaining({ recurringId: netflix.id, date: '2026-09-01' })]);
    expect((await recurringRow(netflix.id)).nextRunOn).toBe('2026-09-01');

    await ctx.db.insert(exchangeRates).values({ rateDate: '2026-09-01', buy: '3.5000', sell: '3.5100' });
    expect((await generateDueRecurring(ctx.db, '2026-09-02')).generated).toBe(1);
  });

  it('la cuota recurrente de una deuda reduce su saldo', async () => {
    const debt = await ctx.post('/debts', { direction: 'i_owe', counterparty: 'Banco', initialAmount: 1000, installment: 250 });
    await createRecurring({
      name: 'Cuota préstamo', type: 'expense', categoryId: debtCategoryId, amountOriginal: 250, frequency: 'monthly', dayOfMonth: 5, startOn: '2026-07-01', debtId: debt.body.id,
    });
    await generateDueRecurring(ctx.db, '2026-09-28');
    expect((await ctx.get(`/debts/${debt.body.id}`)).body).toMatchObject({ paidAmount: '750.00', balance: '250.00' });
  });

  it('POST /recurring/generate lo ejecuta bajo demanda', async () => {
    await createRecurring({
      name: 'Alquiler', type: 'expense', categoryId: rentId, amountOriginal: 1200, frequency: 'monthly', dayOfMonth: 1, startOn: '2026-01-01',
    });
    const response = await ctx.post('/recurring/generate', {});
    expect(response.status).toBe(200);
    expect(response.body.processed).toBe(1);
    expect(response.body.generated).toBeGreaterThan(0);
  });
});
