import type { Currency } from '@justipe/shared';

// Formato de montos y fechas para mostrar en pantalla (es-PE, hora de Lima)

export const TIME_ZONE = 'America/Lima';

const CURRENCY_SYMBOL: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

const numberFormatter = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "1234.5" -> "S/ 1,234.50"
export function formatMoney(amount: string | number, currency: Currency = 'PEN'): string {
  const value = Number(amount);
  const sign = value < 0 ? '-' : '';
  return `${sign}${CURRENCY_SYMBOL[currency]} ${numberFormatter.format(Math.abs(value))}`;
}

// Monto corto para botones: "4", "13", "2.46"
export function formatShortAmount(amount: string | number): string {
  const value = Number(amount);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function currencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOL[currency];
}

const limaDate = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

// Fecha de hoy en Lima como "YYYY-MM-DD"
export function todayInLima(now: Date = new Date()): string {
  return limaDate.format(now);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return todayInLima().slice(0, 7);
}

// "2026-09" + 1 -> "2026-10"
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const result = new Date(Date.UTC(y, m - 1 + delta, 1));
  return result.toISOString().slice(0, 7);
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

const monthFormatter = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// "2026-09" -> "Septiembre 2026"
export function formatMonth(month: string): string {
  const text = monthFormatter.format(new Date(`${month}-01T00:00:00Z`)).replace(' de ', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "2026-09-28" -> "Hoy", "Ayer" o "lun, 28 sept"
export function formatDay(date: string): string {
  const today = todayInLima();
  if (date === today) return 'Hoy';
  if (date === addDays(today, -1)) return 'Ayer';
  return dayFormatter.format(new Date(`${date}T00:00:00Z`));
}
