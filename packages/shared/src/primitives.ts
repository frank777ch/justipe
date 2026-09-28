import { z } from 'zod';

// Valores de los enums; deben coincidir con los pgEnum de la API.
export const CURRENCIES = ['PEN', 'USD'] as const;
export const MOVEMENT_TYPES = ['expense', 'income'] as const;
export const FREQUENCIES = ['monthly', 'biweekly'] as const;
export const DEBT_DIRECTIONS = ['i_owe', 'owed_to_me'] as const;

export const currencySchema = z.enum(CURRENCIES);
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export const frequencySchema = z.enum(FREQUENCIES);
export const debtDirectionSchema = z.enum(DEBT_DIRECTIONS);

export type Currency = z.infer<typeof currencySchema>;
export type MovementType = z.infer<typeof movementTypeSchema>;
export type Frequency = z.infer<typeof frequencySchema>;
export type DebtDirection = z.infer<typeof debtDirectionSchema>;

export const uuidSchema = z.uuid();

// Fecha calendario "YYYY-MM-DD" que además debe existir (rechaza 2026-02-30)
export const isoDateSchema = z.string().refine(isValidIsoDate, { message: 'Fecha inválida, se espera YYYY-MM-DD' });

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Decimal positivo con escala fija, normalizado a string ("13" -> "13.00").
// Se usa string en vez de number para no perder precisión en montos de dinero;
// así viaja también en las respuestas de la API (columnas numeric de Postgres).
function positiveDecimal(scale: number, maxIntegerDigits: number) {
  const pattern = new RegExp(`^\\d{1,${maxIntegerDigits}}(\\.\\d{1,${scale}})?$`);
  return z.union([z.number(), z.string().trim()]).transform((value, ctx) => {
    let text: string;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        ctx.addIssue({ code: 'custom', message: 'Debe ser un número finito' });
        return z.NEVER;
      }
      text = value.toFixed(scale);
      if (Math.abs(Number(text) - value) > 1e-9) {
        ctx.addIssue({ code: 'custom', message: `Máximo ${scale} decimales` });
        return z.NEVER;
      }
    } else {
      text = value;
    }
    if (!pattern.test(text)) {
      ctx.addIssue({ code: 'custom', message: `Debe ser un decimal positivo con máximo ${scale} decimales` });
      return z.NEVER;
    }
    const [integerPart = '0', fractionPart = ''] = text.split('.');
    const normalized = `${BigInt(integerPart).toString()}.${fractionPart.padEnd(scale, '0')}`;
    if (/^0\.0+$/.test(normalized)) {
      ctx.addIssue({ code: 'custom', message: 'Debe ser mayor que cero' });
      return z.NEVER;
    }
    return normalized;
  });
}

// Montos: numeric(14,2) -> hasta 12 dígitos enteros y 2 decimales
export const moneySchema = positiveDecimal(2, 12);
// Tipo de cambio: numeric(10,4) -> hasta 6 dígitos enteros y 4 decimales
export const exchangeRateSchema = positiveDecimal(4, 6);

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hex inválido, ej: #1A2B3C');
