import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { exchangeRates } from '../db/schema/index.js';
import { todayInLima } from '../lib/dates.js';
import { createCategory, setupTestContext } from '../test/helpers.js';
import { getDashboardSummary } from './dashboard.js';
import { generateDueRecurring } from './recurring-generator.js';

const ctx = await setupTestContext();

let foodId: string;
let rentId: string;
let salaryId: string;

beforeEach(async () => {
  foodId = await createCategory(ctx, 'Comida', 'expense');
  rentId = await createCategory(ctx, 'Vivienda', 'expense');
  salaryId = await createCategory(ctx, 'Sueldo', 'income');
});

const expense = (amountOriginal: number, occurredOn: string, extra: Record<string, unknown> = {}) =>
  ctx.post('/movements', { type: 'expense', categoryId: foodId, amountOriginal, occurredOn, ...extra });

describe('getDashboardSummary', () => {
  it('mes vacío: todo en cero y presupuesto diario 0', async () => {
    const summary = await getDashboardSummary(ctx.db, '2026-09', '2026-09-28');
    expect(summary).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      income: '0.00',
      totalExpenses: '0.00',
      remaining: '0.00',
      daysLeft: 3,
      dailyBudget: '0.00',
    });
  });

  it('separa fijos (de recurrentes) y variables, y calcula lo que queda', async () => {
    // Sueldo quincenal y alquiler mensual generados por el cron
    await ctx.post('/recurring', {
      name: 'Sueldo', type: 'income', categoryId: salaryId, amountOriginal: 2500, frequency: 'biweekly', startOn: '2026-09-01',
    });
    await ctx.post('/recurring', {
      name: 'Alquiler', type: 'expense', categoryId: rentId, amountOriginal: 1200, frequency: 'monthly', dayOfMonth: 1, startOn: '2026-09-01',
    });
    await generateDueRecurring(ctx.db, '2026-09-20');

    await expense(13, '2026-09-05');
    await expense(4, '2026-09-18');
    await expense(10, '2026-09-19', { currency: 'USD', exchangeRate: 3.5 });
    // Fuera del mes: no cuentan
    await expense(999, '2026-08-31');
    await expense(999, '2026-10-01');

    const summary = await getDashboardSummary(ctx.db, '2026-09', '2026-09-20');
    expect(summary).toMatchObject({
      income: '2500.00',
      fixedExpenses: '1200.00',
      variableExpenses: '52.00',
      totalExpenses: '1252.00',
      remaining: '1248.00',
      // Falta la quincena del 30: se informa, pero no se cuenta para el presupuesto
      pendingIncome: '2500.00',
      pendingFixedExpenses: '0.00',
      projectedRemaining: '1248.00',
      daysLeft: 11,
      // 1248 / 11 = 113.454… -> hacia abajo
      dailyBudget: '113.45',
    });
  });

  it('descuenta los gastos fijos que aún no se generan este mes', async () => {
    await ctx.post('/recurring', {
      name: 'Internet', type: 'expense', categoryId: rentId, amountOriginal: 100, frequency: 'monthly', dayOfMonth: 25, startOn: '2026-09-01',
    });
    await ctx.post('/movements', { type: 'income', categoryId: salaryId, amountOriginal: 1000, occurredOn: '2026-09-01' });

    const summary = await getDashboardSummary(ctx.db, '2026-09', '2026-09-10');
    expect(summary).toMatchObject({
      remaining: '1000.00',
      pendingFixedExpenses: '100.00',
      projectedRemaining: '900.00',
      daysLeft: 21,
      dailyBudget: '42.85',
    });
  });

  it('los recurrentes en USD pendientes usan la última tasa de venta', async () => {
    await ctx.db.insert(exchangeRates).values({ rateDate: '2026-09-09', buy: '3.4000', sell: '3.5000' });
    await ctx.post('/recurring', {
      name: 'Streaming', type: 'expense', categoryId: rentId, amountOriginal: 10, currency: 'USD', frequency: 'monthly', dayOfMonth: 20, startOn: '2026-09-01',
    });
    const summary = await getDashboardSummary(ctx.db, '2026-09', '2026-09-10');
    expect(summary.pendingFixedExpenses).toBe('35.00');
  });

  it('si se gastó más de la cuenta, el presupuesto diario es 0 (nunca negativo)', async () => {
    await ctx.post('/movements', { type: 'income', categoryId: salaryId, amountOriginal: 100, occurredOn: '2026-09-01' });
    await expense(150, '2026-09-02');
    const summary = await getDashboardSummary(ctx.db, '2026-09', '2026-09-10');
    expect(summary).toMatchObject({ remaining: '-50.00', dailyBudget: '0.00' });
  });

  it('meses pasados no tienen presupuesto diario ni pendientes', async () => {
    await ctx.post('/recurring', {
      name: 'Sueldo', type: 'income', categoryId: salaryId, amountOriginal: 2500, frequency: 'biweekly', startOn: '2026-08-01',
    });
    const summary = await getDashboardSummary(ctx.db, '2026-08', '2026-09-28');
    expect(summary).toMatchObject({ daysLeft: 0, dailyBudget: null, pendingIncome: '0.00' });
  });

  it('ignora movimientos borrados', async () => {
    const created = await expense(50, '2026-09-05');
    await ctx.del(`/movements/${created.body.id}`);
    expect((await getDashboardSummary(ctx.db, '2026-09', '2026-09-28')).variableExpenses).toBe('0.00');
  });
});

describe('GET /dashboard', () => {
  it('por defecto devuelve el mes actual', async () => {
    const response = await ctx.get('/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.month).toBe(todayInLima().slice(0, 7));
  });

  it('valida el parámetro month', async () => {
    expect((await ctx.get('/dashboard?month=2026-13')).status).toBe(422);
    expect((await ctx.get('/dashboard?month=2026-09')).body.from).toBe('2026-09-01');
  });

  it('exige token', async () => {
    expect((await ctx.request('GET', '/dashboard', undefined, null)).status).toBe(401);
  });
});

describe('CORS', () => {
  it('solo responde a los orígenes configurados', async () => {
    const app = createApp(ctx.db, { ...ctx.config, corsOrigins: ['http://localhost:8081'] });
    const preflight = await app.request('/movements', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');

    const other = await app.request('/health', { headers: { origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
