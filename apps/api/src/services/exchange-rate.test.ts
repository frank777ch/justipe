import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { exchangeRates } from '../db/schema/index.js';
import { setupTestContext } from '../test/helpers.js';
import {
  createApisNetPeProvider,
  ExchangeRateProviderError,
  parseApisNetPeResponse,
  syncExchangeRate,
  type ExchangeRateProvider,
} from './exchange-rate.js';

const ctx = await setupTestContext();

const URL_V1 = 'https://api.apis.net.pe/v1/tipo-cambio-sunat';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('parseApisNetPeResponse', () => {
  it('lee el formato v1 real de apis.net.pe', () => {
    const body = { origen: 'SUNAT', compra: 3.4, venta: 3.406, moneda: 'USD', fecha: '2026-09-25' };
    expect(parseApisNetPeResponse(body, '2026-09-25')).toEqual({ rateDate: '2026-09-25', buy: '3.4000', sell: '3.4060' });
  });

  it('acepta variantes con nombres de v2 y valores como texto', () => {
    expect(parseApisNetPeResponse({ precioCompra: '3.75', precioVenta: '3.76' }, '2026-09-25')).toMatchObject({
      buy: '3.7500',
      sell: '3.7600',
    });
  });

  it('devuelve null si faltan datos o son inválidos', () => {
    expect(parseApisNetPeResponse({ message: 'Not found' }, '2026-09-25')).toBeNull();
    expect(parseApisNetPeResponse({ compra: 0, venta: -1 }, '2026-09-25')).toBeNull();
    expect(parseApisNetPeResponse(null, '2026-09-25')).toBeNull();
  });
});

describe('createApisNetPeProvider', () => {
  it('consulta con la fecha y envía el token si existe', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ compra: 3.416, venta: 3.425, fecha: '2026-09-26' }));
    const provider = createApisNetPeProvider({ url: URL_V1, token: 'mi-token', fetchFn });

    expect(await provider('2026-09-26')).toEqual({ rateDate: '2026-09-26', buy: '3.4160', sell: '3.4250' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`${URL_V1}?fecha=2026-09-26`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer mi-token');
  });

  it('sin token no envía cabecera de autorización', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ compra: 3.4, venta: 3.41 }));
    await createApisNetPeProvider({ url: URL_V1, fetchFn })('2026-09-26');
    const [, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('404 significa "aún no publicado"', async () => {
    const provider = createApisNetPeProvider({ url: URL_V1, fetchFn: async () => jsonResponse({ message: 'Not found' }, 404) });
    expect(await provider('2026-09-28')).toBeNull();
  });

  it('429 u otros errores lanzan ExchangeRateProviderError', async () => {
    const provider = createApisNetPeProvider({ url: URL_V1, fetchFn: async () => new Response('<html>429</html>', { status: 429 }) });
    await expect(provider('2026-09-28')).rejects.toBeInstanceOf(ExchangeRateProviderError);
  });

  it('una respuesta 200 con formato inesperado es un error', async () => {
    const provider = createApisNetPeProvider({ url: URL_V1, fetchFn: async () => jsonResponse({ foo: 'bar' }) });
    await expect(provider('2026-09-28')).rejects.toThrow('formato inesperado');
  });
});

describe('syncExchangeRate', () => {
  const provider: ExchangeRateProvider = async (date) => ({ rateDate: date, buy: '3.7000', sell: '3.7100' });

  it('guarda la tasa como source api y la actualiza si cambia', async () => {
    expect(await syncExchangeRate(ctx.db, provider, '2026-09-28')).toMatchObject({ status: 'saved' });
    const changed: ExchangeRateProvider = async (date) => ({ rateDate: date, buy: '3.7200', sell: '3.7300' });
    await syncExchangeRate(ctx.db, changed, '2026-09-28');

    const [row] = await ctx.db.select().from(exchangeRates).where(eq(exchangeRates.rateDate, '2026-09-28'));
    expect(row).toMatchObject({ buy: '3.7200', sell: '3.7300', source: 'api' });
  });

  it('no sobrescribe una tasa editada a mano', async () => {
    await ctx.db.insert(exchangeRates).values({ rateDate: '2026-09-28', buy: '3.9000', sell: '3.9500', source: 'manual' });
    expect(await syncExchangeRate(ctx.db, provider, '2026-09-28')).toEqual({ status: 'kept_manual', rateDate: '2026-09-28' });

    const [row] = await ctx.db.select().from(exchangeRates).where(eq(exchangeRates.rateDate, '2026-09-28'));
    expect(row).toMatchObject({ sell: '3.9500', source: 'manual' });
  });

  it('si no está publicada no guarda nada', async () => {
    expect(await syncExchangeRate(ctx.db, async () => null, '2026-09-28')).toEqual({ status: 'not_published', rateDate: '2026-09-28' });
    expect(await ctx.db.select().from(exchangeRates)).toHaveLength(0);
  });
});
