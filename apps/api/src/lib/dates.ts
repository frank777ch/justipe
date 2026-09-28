// Utilidades de fechas calendario ("YYYY-MM-DD") en la zona horaria de Lima.
// Se trabaja con strings: se comparan bien lexicográficamente y evitan
// errores de zona horaria al convertir a Date.

export const APP_TIME_ZONE = 'America/Lima';

const limaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Fecha de hoy en Lima, independiente de la zona horaria del servidor
export function todayInLima(now: Date = new Date()): string {
  return limaDateFormatter.format(now);
}

export function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

// month va de 1 a 12
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export interface Schedule {
  frequency: 'monthly' | 'biweekly';
  dayOfMonth: number | null;
  startOn: string;
  endOn: string | null;
}

// Fechas en que un recurrente se genera dentro de un mes, en orden.
// monthly: el día elegido, o el último día si el mes es más corto (31 -> 30 o 28/29).
// biweekly: los días 15 y último del mes.
export function occurrencesInMonth(schedule: Pick<Schedule, 'frequency' | 'dayOfMonth'>, year: number, month: number): string[] {
  const lastDay = lastDayOfMonth(year, month);
  if (schedule.frequency === 'monthly') {
    const day = Math.min(schedule.dayOfMonth ?? 1, lastDay);
    return [formatDate(year, month, day)];
  }
  return [formatDate(year, month, 15), formatDate(year, month, lastDay)];
}

// Primera fecha de generación en o después de "from" (y nunca antes de startOn).
// Devuelve null si ya no quedan fechas antes de endOn.
export function nextOccurrenceOnOrAfter(schedule: Schedule, from: string): string | null {
  const start = maxDate(from, schedule.startOn);
  let { year, month } = parseDate(start);
  // Basta revisar dos meses: siempre hay al menos una fecha por mes
  for (let i = 0; i < 2; i++) {
    for (const date of occurrencesInMonth(schedule, year, month)) {
      if (date < start) continue;
      if (schedule.endOn !== null && date > schedule.endOn) return null;
      return date;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}

// Primera fecha estrictamente posterior a "after"
export function nextOccurrenceAfter(schedule: Schedule, after: string): string | null {
  const { year, month, day } = parseDate(after);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return nextOccurrenceOnOrAfter(
    schedule,
    formatDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  );
}
