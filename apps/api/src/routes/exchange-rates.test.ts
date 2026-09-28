import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { exchangeRates } from '../db/schema/index.js';
import { todayInLima } from '../lib/dates.js';
import { ExchangeRateProviderError } from '../services/exchange-rate.js';
import { setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

async function seedRates() {
  await ctx.db.insert(exchangeRates).values([
    { rateDate: '2026-09-24', buy: '3.4000', sell: '3.4100' },
    { rateDate: '2026-09-25', buy: '3.4000', sell: '3.4060' },
    { rateDate: '2026-09-28', buy: '3.4200', sell: '3.4300', source: 'manual' },
  ]);
}

describe('tipo de cambio', () => {
  it('lista del más reciente al más antiguo, con rango', async () => {
    await seedRates();
    const all = await ctx.get('/exchange-rates');
    expect(all.body.map((r: { rateDate: string }) => r.rateDate)).toEqual(['2026-09-28', '2026-09-25', '2026-09-24']);
    const range = await ctx.get('/exchange-rates?from=2026-09-25&to=2026-09-27');
    expect(range.body.map((r: { rateDate: string }) => r.rateDate)).toEqual(['2026-09-25']);
  });

  it('latest devuelve la tasa vigente para una fecha', async () => {
    await seedRates();
    expect((await ctx.get('/exchange-rates/latest?date=2026-09-27')).body).toMatchObject({ rateDate: '2026-09-25', sell: '3.4060' });
    expect((await ctx.get('/exchange-rates/latest?date=2026-09-01')).status).toBe(404);
  });

  it('PUT crea o reemplaza la tasa del día como manual', async () => {
    await seedRates();
    const created = await ctx.request('PUT', '/exchange-rates/2026-09-26', { buy: 3.41, sell: '3.4150' });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ rateDate: '2026-09-26', buy: '3.4100', sell: '3.4150', source: 'manual' });

    const replaced = await ctx.request('PUT', '/exchange-rates/2026-09-25', { buy: 3.5, sell: 3.51 });
    expect(replaced.body).toMatchObject({ sell: '3.5100', source: 'manual' });
  });

  it('PUT valida que la compra no supere la venta', async () => {
    const response = await ctx.request('PUT', '/exchange-rates/2026-09-26', { buy: 3.6, sell: 3.5 });
    expect(response.status).toBe(422);
  });

  it('DELETE borra la tasa del día', async () => {
    await seedRates();
    expect((await ctx.del('/exchange-rates/2026-09-28')).status).toBe(204);
    expect((await ctx.del('/exchange-rates/2026-09-28')).status).toBe(404);
  });

  it('POST /sync consulta el proveedor y guarda la tasa', async () => {
    const app = createApp(ctx.db, {
      ...ctx.config,
      exchangeRateProvider: async (date) => ({ rateDate: date, buy: '3.4160', sell: '3.4250' }),
    });
    const response = await app.request('/exchange-rates/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${ctx.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-26' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'saved', rate: { rateDate: '2026-09-26', sell: '3.4250' } });
  });

  it('POST /sync sin fecha usa hoy', async () => {
    let requested = '';
    const app = createApp(ctx.db, {
      ...ctx.config,
      exchangeRateProvider: async (date) => {
        requested = date;
        return null;
      },
    });
    await app.request('/exchange-rates/sync', { method: 'POST', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(requested).toBe(todayInLima());
  });

  it('POST /sync responde 502 si el proveedor falla y 503 si está desactivado', async () => {
    const failing = createApp(ctx.db, {
      ...ctx.config,
      exchangeRateProvider: async () => {
        throw new ExchangeRateProviderError('apis.net.pe respondió 429', 429);
      },
    });
    const response = await failing.request('/exchange-rates/sync', { method: 'POST', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(response.status).toBe(502);

    // El contexto de tests arma la app sin proveedor
    expect((await ctx.post('/exchange-rates/sync', {})).status).toBe(503);
  });
});
