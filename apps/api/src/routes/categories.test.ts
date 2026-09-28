import { describe, expect, it } from 'vitest';
import { setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

describe('categorías', () => {
  it('crea, lista, obtiene, actualiza y borra', async () => {
    const created = await ctx.post('/categories', { name: 'Comida', type: 'expense', color: '#E4572E' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Comida', type: 'expense', color: '#E4572E', deletedAt: null });

    const id = created.body.id;
    expect((await ctx.get(`/categories/${id}`)).body.name).toBe('Comida');

    const updated = await ctx.patch(`/categories/${id}`, { name: 'Restaurantes', sortOrder: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Restaurantes', sortOrder: 3 });
    expect(new Date(updated.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.body.updatedAt).getTime());

    expect((await ctx.del(`/categories/${id}`)).status).toBe(204);
    expect((await ctx.get(`/categories/${id}`)).status).toBe(404);
    expect((await ctx.get('/categories')).body).toHaveLength(0);
    expect((await ctx.del(`/categories/${id}`)).status).toBe(404);
  });

  it('filtra por tipo', async () => {
    await ctx.post('/categories', { name: 'Comida', type: 'expense' });
    await ctx.post('/categories', { name: 'Sueldo', type: 'income' });
    const incomes = await ctx.get('/categories?type=income');
    expect(incomes.body.map((c: { name: string }) => c.name)).toEqual(['Sueldo']);
  });

  it('no permite nombres repetidos (sin importar mayúsculas) dentro del mismo tipo', async () => {
    await ctx.post('/categories', { name: 'Comida', type: 'expense' });
    const duplicate = await ctx.post('/categories', { name: 'comida', type: 'expense' });
    expect(duplicate.status).toBe(409);
    // En otro tipo sí se permite
    expect((await ctx.post('/categories', { name: 'Comida', type: 'income' })).status).toBe(201);
  });

  it('permite reutilizar el nombre de una categoría borrada', async () => {
    const first = await ctx.post('/categories', { name: 'Taxi', type: 'expense' });
    await ctx.del(`/categories/${first.body.id}`);
    expect((await ctx.post('/categories', { name: 'Taxi', type: 'expense' })).status).toBe(201);
  });

  it('POST con id del cliente es idempotente (reintentos offline)', async () => {
    const id = '0192f000-0000-7000-8000-000000000001';
    const first = await ctx.post('/categories', { id, name: 'Salud', type: 'expense' });
    const retry = await ctx.post('/categories', { id, name: 'Salud', type: 'expense' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(id);
    expect((await ctx.get('/categories')).body).toHaveLength(1);
  });

  it('no permite cambiar el tipo', async () => {
    const created = await ctx.post('/categories', { name: 'Comida', type: 'expense' });
    const updated = await ctx.patch(`/categories/${created.body.id}`, { type: 'income' });
    expect(updated.body.type).toBe('expense');
  });

  it('valida los datos de entrada', async () => {
    const response = await ctx.post('/categories', { name: '  ', type: 'otro', color: 'rojo' });
    expect(response.status).toBe(422);
    const paths = response.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'type', 'color']));
  });

  it('valida el id de la ruta', async () => {
    expect((await ctx.get('/categories/no-es-uuid')).status).toBe(422);
  });
});
