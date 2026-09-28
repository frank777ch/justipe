import { beforeEach, describe, expect, it } from 'vitest';
import { todayInLima } from '../lib/dates.js';
import { createCategory, setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

let rentCategoryId: string;
let salaryCategoryId: string;

beforeEach(async () => {
  rentCategoryId = await createCategory(ctx, 'Vivienda', 'expense');
  salaryCategoryId = await createCategory(ctx, 'Sueldo', 'income');
});

describe('recurrentes', () => {
  it('mensual el día 31 empieza en la fecha ajustada al mes', async () => {
    const response = await ctx.post('/recurring', {
      name: 'Alquiler',
      type: 'expense',
      categoryId: rentCategoryId,
      amountOriginal: 1200,
      frequency: 'monthly',
      dayOfMonth: 31,
      startOn: '2027-02-01',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      nextRunOn: '2027-02-28',
      active: true,
      currency: 'PEN',
      amountOriginal: '1200.00',
    });
  });

  it('quincenal empieza el 15 o el último día', async () => {
    const response = await ctx.post('/recurring', {
      name: 'Sueldo',
      type: 'income',
      categoryId: salaryCategoryId,
      amountOriginal: 2500,
      frequency: 'biweekly',
      startOn: '2027-03-16',
    });
    expect(response.body.nextRunOn).toBe('2027-03-31');
    expect(response.body.dayOfMonth).toBeNull();
  });

  it('valida la coherencia frecuencia / día', async () => {
    const response = await ctx.post('/recurring', {
      name: 'Luz', type: 'expense', categoryId: rentCategoryId, amountOriginal: 80, frequency: 'monthly', startOn: '2027-01-01',
    });
    expect(response.status).toBe(422);
    expect(response.body.error.details[0].path).toBe('dayOfMonth');
  });

  it('rechaza calendarios que no generan ninguna fecha', async () => {
    const response = await ctx.post('/recurring', {
      name: 'Nada',
      type: 'expense',
      categoryId: rentCategoryId,
      amountOriginal: 10,
      frequency: 'monthly',
      dayOfMonth: 20,
      startOn: '2027-01-01',
      endOn: '2027-01-10',
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('empty_schedule');
  });

  it('la categoría debe coincidir con el tipo', async () => {
    const response = await ctx.post('/recurring', {
      name: 'Sueldo', type: 'income', categoryId: rentCategoryId, amountOriginal: 10, frequency: 'biweekly', startOn: '2027-01-01',
    });
    expect(response.body.error.code).toBe('category_type_mismatch');
  });

  it('al cambiar el calendario recalcula la próxima fecha desde hoy', async () => {
    const created = await ctx.post('/recurring', {
      name: 'Internet', type: 'expense', categoryId: rentCategoryId, amountOriginal: 99, frequency: 'monthly', dayOfMonth: 5, startOn: '2025-01-01',
    });
    // startOn en el pasado: el cron generará los periodos atrasados desde ahí
    expect(created.body.nextRunOn).toBe('2025-01-05');

    const updated = await ctx.patch(`/recurring/${created.body.id}`, { frequency: 'biweekly', dayOfMonth: null });
    expect(updated.status).toBe(200);
    expect(updated.body.frequency).toBe('biweekly');
    expect(updated.body.nextRunOn >= todayInLima()).toBe(true);
  });

  it('cambiar solo el monto no toca la próxima fecha', async () => {
    const created = await ctx.post('/recurring', {
      name: 'Gym', type: 'expense', categoryId: rentCategoryId, amountOriginal: 100, frequency: 'monthly', dayOfMonth: 10, startOn: '2027-01-01',
    });
    const updated = await ctx.patch(`/recurring/${created.body.id}`, { amountOriginal: 120 });
    expect(updated.body).toMatchObject({ amountOriginal: '120.00', nextRunOn: '2027-01-10' });
  });

  it('valida el registro combinado al actualizar', async () => {
    const created = await ctx.post('/recurring', {
      name: 'Gym', type: 'expense', categoryId: rentCategoryId, amountOriginal: 100, frequency: 'monthly', dayOfMonth: 10, startOn: '2027-01-01',
    });
    // Pasar a quincenal sin limpiar dayOfMonth es incoherente
    const response = await ctx.patch(`/recurring/${created.body.id}`, { frequency: 'biweekly' });
    expect(response.status).toBe(422);
  });

  it('borrado lógico', async () => {
    const created = await ctx.post('/recurring', {
      name: 'Gym', type: 'expense', categoryId: rentCategoryId, amountOriginal: 100, frequency: 'monthly', dayOfMonth: 10, startOn: '2027-01-01',
    });
    expect((await ctx.del(`/recurring/${created.body.id}`)).status).toBe(204);
    expect((await ctx.get('/recurring')).body).toHaveLength(0);
  });
});
