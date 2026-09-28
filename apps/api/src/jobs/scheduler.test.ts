import { Cron } from 'croner';
import { describe, expect, it, vi } from 'vitest';
import { exchangeRates, movements } from '../db/schema/index.js';
import { APP_TIME_ZONE } from '../lib/dates.js';
import type { ExchangeRateProvider } from '../services/exchange-rate.js';
import { createCategory, setupTestContext } from '../test/helpers.js';
import { EXCHANGE_RATE_CRON, RECURRING_CRON, startScheduler } from './scheduler.js';

const ctx = await setupTestContext();

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
// 28/09/2026 10:00 en Lima
const now = () => new Date('2026-09-28T15:00:00Z');

describe('horarios', () => {
  it('recurrentes a las 00:05 y tipo de cambio 07:15, 12:15 y 18:15 (hora de Lima)', () => {
    const from = new Date('2026-09-28T05:00:00Z'); // 00:00 en Lima
    const recurringRuns = new Cron(RECURRING_CRON, { timezone: APP_TIME_ZONE, paused: true }).nextRuns(2, from);
    expect(recurringRuns.map((d) => d.toISOString())).toEqual(['2026-09-28T05:05:00.000Z', '2026-09-29T05:05:00.000Z']);

    const rateRuns = new Cron(EXCHANGE_RATE_CRON, { timezone: APP_TIME_ZONE, paused: true }).nextRuns(3, from);
    expect(rateRuns.map((d) => d.toISOString())).toEqual([
      '2026-09-28T12:15:00.000Z',
      '2026-09-28T17:15:00.000Z',
      '2026-09-28T23:15:00.000Z',
    ]);
  });
});

describe('startScheduler', () => {
  it('al arrancar trae el tipo de cambio de hoy y genera los recurrentes atrasados', async () => {
    const provider = vi.fn<ExchangeRateProvider>(async (date) => ({ rateDate: date, buy: '3.4000', sell: '3.4100' }));
    const categoryId = await createCategory(ctx, 'Vivienda');
    await ctx.post('/recurring', {
      name: 'Streaming', type: 'expense', categoryId, amountOriginal: 10, currency: 'USD', frequency: 'monthly', dayOfMonth: 28, startOn: '2026-09-01',
    });

    const scheduler = startScheduler({ db: ctx.db, exchangeRateProvider: provider, logger: silentLogger, now });
    await scheduler.ready;
    scheduler.stop();

    expect(provider).toHaveBeenCalledWith('2026-09-28');
    // El recurrente en USD de hoy usa la tasa recién obtenida
    const [movement] = await ctx.db.select().from(movements);
    expect(movement).toMatchObject({ occurredOn: '2026-09-28', exchangeRate: '3.4100', amountPen: '34.10' });
  });

  it('no vuelve a consultar el tipo de cambio si ya existe el de hoy', async () => {
    await ctx.db.insert(exchangeRates).values({ rateDate: '2026-09-28', buy: '3.4000', sell: '3.4100' });
    const provider = vi.fn<ExchangeRateProvider>(async () => null);

    const scheduler = startScheduler({ db: ctx.db, exchangeRateProvider: provider, logger: silentLogger, now });
    await scheduler.ready;
    scheduler.stop();
    expect(provider).not.toHaveBeenCalled();
  });

  it('un fallo del proveedor no impide generar los recurrentes', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const categoryId = await createCategory(ctx, 'Vivienda');
    await ctx.post('/recurring', {
      name: 'Alquiler', type: 'expense', categoryId, amountOriginal: 1200, frequency: 'monthly', dayOfMonth: 1, startOn: '2026-09-01',
    });

    const scheduler = startScheduler({
      db: ctx.db,
      exchangeRateProvider: async () => {
        throw new Error('sin conexión');
      },
      logger,
      now,
    });
    await scheduler.ready;
    scheduler.stop();

    expect(logger.error).toHaveBeenCalledWith('[tipo de cambio] error:', 'sin conexión');
    expect(await ctx.db.select().from(movements)).toHaveLength(1);
  });

  it('sin proveedor solo programa los recurrentes', async () => {
    const scheduler = startScheduler({ db: ctx.db, logger: silentLogger, now });
    await scheduler.ready;
    expect(Object.keys(scheduler.nextRuns())).toEqual(['recurring']);
    scheduler.stop();
  });
});
