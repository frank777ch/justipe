import { isoDateSchema, moneySchema, exchangeRateSchema, recurringCreateSchema } from '@justipe/shared';
import { describe, expect, it } from 'vitest';

// Tests de los esquemas compartidos (@justipe/shared) que usa la API

describe('moneySchema', () => {
  it('normaliza números y strings a 2 decimales', () => {
    expect(moneySchema.parse(4)).toBe('4.00');
    expect(moneySchema.parse(2.46)).toBe('2.46');
    expect(moneySchema.parse('13')).toBe('13.00');
    expect(moneySchema.parse(' 6.5 ')).toBe('6.50');
    expect(moneySchema.parse('007.10')).toBe('7.10');
  });

  it('rechaza cero, negativos, más de 2 decimales y texto', () => {
    for (const value of [0, '0.00', -1, '-1', 1.234, '1.234', 'abc', '', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(moneySchema.safeParse(value).success, `debería rechazar ${String(value)}`).toBe(false);
    }
  });

  it('respeta el máximo de numeric(14,2)', () => {
    expect(moneySchema.parse('999999999999.99')).toBe('999999999999.99');
    expect(moneySchema.safeParse('1000000000000').success).toBe(false);
  });
});

describe('exchangeRateSchema', () => {
  it('acepta hasta 4 decimales', () => {
    expect(exchangeRateSchema.parse(3.7512)).toBe('3.7512');
    expect(exchangeRateSchema.parse('3.7')).toBe('3.7000');
    expect(exchangeRateSchema.safeParse('3.75123').success).toBe(false);
  });
});

describe('isoDateSchema', () => {
  it('acepta solo fechas reales en formato YYYY-MM-DD', () => {
    expect(isoDateSchema.safeParse('2026-09-28').success).toBe(true);
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(isoDateSchema.safeParse('28/09/2026').success).toBe(false);
  });
});

describe('recurringCreateSchema', () => {
  const base = {
    name: 'Alquiler',
    type: 'expense',
    categoryId: '00000000-0000-7000-8000-000000000105',
    amountOriginal: 1200,
    startOn: '2026-10-01',
  };

  it('mensual exige dayOfMonth', () => {
    expect(recurringCreateSchema.safeParse({ ...base, frequency: 'monthly' }).success).toBe(false);
    expect(recurringCreateSchema.safeParse({ ...base, frequency: 'monthly', dayOfMonth: 1 }).success).toBe(true);
  });

  it('quincenal no acepta dayOfMonth', () => {
    expect(recurringCreateSchema.safeParse({ ...base, frequency: 'biweekly', dayOfMonth: 15 }).success).toBe(false);
    expect(recurringCreateSchema.safeParse({ ...base, frequency: 'biweekly' }).success).toBe(true);
  });

  it('endOn no puede ser anterior a startOn', () => {
    const result = recurringCreateSchema.safeParse({ ...base, frequency: 'biweekly', endOn: '2026-09-01' });
    expect(result.success).toBe(false);
  });

  it('aplica valores por defecto', () => {
    const parsed = recurringCreateSchema.parse({ ...base, frequency: 'biweekly' });
    expect(parsed.currency).toBe('PEN');
    expect(parsed.active).toBe(true);
    expect(parsed.amountOriginal).toBe('1200.00');
  });
});
