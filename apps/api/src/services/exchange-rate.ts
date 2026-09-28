import { sql } from 'drizzle-orm';
import { exchangeRates } from '../db/schema/index.js';
import type { Database } from '../db/types.js';

// Tipo de cambio USD → PEN publicado por SUNAT, obtenido de apis.net.pe.

export interface SunatRate {
  rateDate: string;
  buy: string;
  sell: string;
}

// Proveedor inyectable: en producción consulta apis.net.pe; en tests es un falso.
export type ExchangeRateProvider = (date: string) => Promise<SunatRate | null>;

export class ExchangeRateProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ExchangeRateProviderError';
  }
}

export interface ApisNetPeOptions {
  // Endpoint v1: https://api.apis.net.pe/v1/tipo-cambio-sunat?fecha=YYYY-MM-DD
  url: string;
  // Opcional: el acceso anónimo tiene un límite muy bajo de peticiones
  token?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

// Convierte el valor recibido a decimal con 4 decimales ("3.406" -> "3.4060")
function toRate(value: unknown): string | null {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric <= 0 || numeric >= 1_000_000) return null;
  return numeric.toFixed(4);
}

// Acepta el formato v1 ({ compra, venta, fecha }) y variantes conocidas de v2
export function parseApisNetPeResponse(body: unknown, requestedDate: string): SunatRate | null {
  if (typeof body !== 'object' || body === null) return null;
  const data = body as Record<string, unknown>;
  const buy = toRate(data.compra ?? data.precioCompra ?? data.buyPrice);
  const sell = toRate(data.venta ?? data.precioVenta ?? data.sellPrice);
  if (!buy || !sell) return null;
  // Se guarda con la fecha pedida: así cada día consultado tiene su fila
  return { rateDate: requestedDate, buy, sell };
}

export function createApisNetPeProvider(options: ApisNetPeOptions): ExchangeRateProvider {
  const fetchFn = options.fetchFn ?? fetch;
  return async (date) => {
    const url = new URL(options.url);
    url.searchParams.set('fecha', date);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;

    const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
    // 404: no hay tasa publicada para esa fecha (p. ej. todavía no sale la de hoy)
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ExchangeRateProviderError(`apis.net.pe respondió ${response.status}`, response.status);
    }
    const rate = parseApisNetPeResponse(await response.json(), date);
    if (!rate) throw new ExchangeRateProviderError('Respuesta de apis.net.pe con formato inesperado');
    return rate;
  };
}

export type SyncResult =
  | { status: 'saved'; rate: SunatRate }
  | { status: 'kept_manual'; rateDate: string }
  | { status: 'not_published'; rateDate: string };

// Consulta la tasa de un día y la guarda. Nunca sobrescribe una tasa editada a mano.
export async function syncExchangeRate(db: Database, provider: ExchangeRateProvider, date: string): Promise<SyncResult> {
  const rate = await provider(date);
  if (!rate) return { status: 'not_published', rateDate: date };

  const saved = await db
    .insert(exchangeRates)
    .values({ rateDate: rate.rateDate, buy: rate.buy, sell: rate.sell, source: 'api' })
    .onConflictDoUpdate({
      target: exchangeRates.rateDate,
      set: { buy: rate.buy, sell: rate.sell },
      setWhere: sql`${exchangeRates.source} = 'api'`,
    })
    .returning({ rateDate: exchangeRates.rateDate });

  return saved.length > 0 ? { status: 'saved', rate } : { status: 'kept_manual', rateDate: rate.rateDate };
}
