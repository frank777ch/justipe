import { describe, expect, it } from 'vitest';
import { lastDayOfMonth, nextOccurrenceAfter, nextOccurrenceOnOrAfter, occurrencesInMonth, todayInLima, type Schedule } from './dates.js';

const monthly = (dayOfMonth: number, startOn = '2026-01-01', endOn: string | null = null): Schedule => ({
  frequency: 'monthly',
  dayOfMonth,
  startOn,
  endOn,
});
const biweekly = (startOn = '2026-01-01', endOn: string | null = null): Schedule => ({
  frequency: 'biweekly',
  dayOfMonth: null,
  startOn,
  endOn,
});

describe('lastDayOfMonth', () => {
  it('considera años bisiestos', () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
    expect(lastDayOfMonth(2026, 12)).toBe(31);
  });
});

describe('occurrencesInMonth', () => {
  it('mensual el 31 cae el último día en meses cortos', () => {
    expect(occurrencesInMonth(monthly(31), 2026, 2)).toEqual(['2026-02-28']);
    expect(occurrencesInMonth(monthly(31), 2026, 4)).toEqual(['2026-04-30']);
    expect(occurrencesInMonth(monthly(31), 2026, 5)).toEqual(['2026-05-31']);
  });

  it('quincenal genera el 15 y el último día', () => {
    expect(occurrencesInMonth(biweekly(), 2026, 2)).toEqual(['2026-02-15', '2026-02-28']);
    expect(occurrencesInMonth(biweekly(), 2026, 9)).toEqual(['2026-09-15', '2026-09-30']);
  });
});

describe('nextOccurrenceOnOrAfter', () => {
  it('devuelve la misma fecha si coincide', () => {
    expect(nextOccurrenceOnOrAfter(monthly(10), '2026-03-10')).toBe('2026-03-10');
  });

  it('pasa al mes siguiente si el día ya pasó, incluso cruzando de año', () => {
    expect(nextOccurrenceOnOrAfter(monthly(10), '2026-03-11')).toBe('2026-04-10');
    expect(nextOccurrenceOnOrAfter(monthly(5), '2026-12-20')).toBe('2027-01-05');
  });

  it('nunca devuelve fechas anteriores a startOn', () => {
    expect(nextOccurrenceOnOrAfter(monthly(1, '2026-06-15'), '2026-01-01')).toBe('2026-07-01');
  });

  it('quincenal elige la siguiente mitad del mes', () => {
    expect(nextOccurrenceOnOrAfter(biweekly(), '2026-09-01')).toBe('2026-09-15');
    expect(nextOccurrenceOnOrAfter(biweekly(), '2026-09-16')).toBe('2026-09-30');
    expect(nextOccurrenceOnOrAfter(biweekly(), '2026-10-01')).toBe('2026-10-15');
  });

  it('devuelve null si la siguiente fecha supera endOn', () => {
    expect(nextOccurrenceOnOrAfter(monthly(20, '2026-01-01', '2026-03-10'), '2026-02-21')).toBeNull();
  });
});

describe('nextOccurrenceAfter', () => {
  it('avanza estrictamente después de la fecha dada', () => {
    expect(nextOccurrenceAfter(biweekly(), '2026-02-15')).toBe('2026-02-28');
    expect(nextOccurrenceAfter(biweekly(), '2026-02-28')).toBe('2026-03-15');
    expect(nextOccurrenceAfter(monthly(31), '2026-01-31')).toBe('2026-02-28');
  });
});

describe('todayInLima', () => {
  it('usa la hora de Lima (UTC-5) y no la del servidor', () => {
    // 03:00 UTC del 1 de octubre = 22:00 del 30 de septiembre en Lima
    expect(todayInLima(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09-30');
    expect(todayInLima(new Date('2026-10-01T05:00:00Z'))).toBe('2026-10-01');
  });
});
