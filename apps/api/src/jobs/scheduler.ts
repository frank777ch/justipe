import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import { exchangeRates } from '../db/schema/index.js';
import type { Database } from '../db/types.js';
import { APP_TIME_ZONE, todayInLima } from '../lib/dates.js';
import { syncExchangeRate, type ExchangeRateProvider } from '../services/exchange-rate.js';
import { generateDueRecurring } from '../services/recurring-generator.js';

// Tareas programadas dentro del proceso de la API (sin contenedor extra, sin RAM extra).
// Horarios en hora de Lima:
// - 00:05 genera los movimientos recurrentes del día.
// - 07:15, 12:15 y 18:15 consulta el tipo de cambio. Es idempotente, así que los
//   intentos extra solo sirven de reintento si apis.net.pe falla o limita peticiones.
// Al arrancar se pone al día: tipo de cambio de hoy si falta y recurrentes atrasados.

export const RECURRING_CRON = '5 0 * * *';
export const EXCHANGE_RATE_CRON = '15 7,12,18 * * *';

type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

export interface SchedulerOptions {
  db: Database;
  // Sin proveedor no se consulta el tipo de cambio (solo edición manual)
  exchangeRateProvider?: ExchangeRateProvider;
  logger?: Logger;
  // Hora actual inyectable para tests
  now?: () => Date;
}

// fetch de Node envuelve la causa real (DNS, TLS, timeout) en "fetch failed"
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return `${error.message}${cause}`;
}

export function startScheduler({ db, exchangeRateProvider, logger = console, now = () => new Date() }: SchedulerOptions) {
  const today = () => todayInLima(now());

  async function runRecurring(): Promise<void> {
    const summary = await generateDueRecurring(db, today());
    if (summary.generated > 0 || summary.skipped.length > 0) {
      logger.log(`[recurrentes] ${summary.generated} movimiento(s) generado(s) de ${summary.processed} recurrente(s)`);
    }
    for (const skip of summary.skipped) {
      logger.warn(`[recurrentes] "${skip.name}" (${skip.date}) pendiente: ${skip.reason}`);
    }
  }

  async function runExchangeRate(): Promise<void> {
    if (!exchangeRateProvider) return;
    const result = await syncExchangeRate(db, exchangeRateProvider, today());
    if (result.status === 'saved') {
      logger.log(`[tipo de cambio] ${result.rate.rateDate}: compra ${result.rate.buy}, venta ${result.rate.sell}`);
    } else if (result.status === 'not_published') {
      logger.warn(`[tipo de cambio] ${result.rateDate}: aún no publicado`);
    }
  }

  async function catchUp(): Promise<void> {
    if (exchangeRateProvider) {
      // Solo si falta: evita gastar el cupo de peticiones en cada reinicio
      const [existing] = await db
        .select({ rateDate: exchangeRates.rateDate })
        .from(exchangeRates)
        .where(eq(exchangeRates.rateDate, today()));
      if (!existing) await runExchangeRate().catch(onError('tipo de cambio'));
    }
    // Después del tipo de cambio, para que los recurrentes en USD de hoy lo usen
    await runRecurring().catch(onError('recurrentes'));
  }

  function onError(job: string) {
    return (error: unknown) => {
      logger.error(`[${job}] error:`, describeError(error));
    };
  }

  const options = { timezone: APP_TIME_ZONE, protect: true };
  const jobs = [
    new Cron(RECURRING_CRON, { ...options, name: 'recurring', catch: onError('recurrentes') }, runRecurring),
  ];
  if (exchangeRateProvider) {
    jobs.push(new Cron(EXCHANGE_RATE_CRON, { ...options, name: 'exchange-rate', catch: onError('tipo de cambio') }, runExchangeRate));
  } else {
    logger.warn('[tipo de cambio] consulta automática desactivada');
  }

  const ready = catchUp();

  return {
    // Se resuelve cuando termina la puesta al día inicial
    ready,
    runRecurring,
    runExchangeRate,
    nextRuns: () => Object.fromEntries(jobs.map((job) => [job.name, job.nextRun()?.toISOString() ?? null])),
    stop: () => jobs.forEach((job) => job.stop()),
  };
}
