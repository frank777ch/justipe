import { z } from 'zod';
import {
  currencySchema,
  debtDirectionSchema,
  exchangeRateSchema,
  frequencySchema,
  hexColorSchema,
  isoDateSchema,
  moneySchema,
  movementTypeSchema,
  uuidSchema,
} from './primitives.js';

// Esquemas de entrada de la API. La app los reutiliza para validar formularios.
// Regla general: "create" acepta un id opcional generado en el cliente (UUIDv7)
// para poder crear registros offline; "update" es parcial y nunca cambia el id.

// --- Auth ---
export const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

// --- Categorías ---
export const categoryCreateSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(60),
  type: movementTypeSchema,
  icon: z.string().trim().max(40).nullish(),
  color: hexColorSchema.nullish(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

// El tipo no se puede cambiar: rompería la coherencia con sus movimientos
export const categoryUpdateSchema = categoryCreateSchema.omit({ id: true, type: true }).partial();

// --- Movimientos ---
export const movementCreateSchema = z.object({
  id: uuidSchema.optional(),
  type: movementTypeSchema,
  categoryId: uuidSchema,
  amountOriginal: moneySchema,
  currency: currencySchema.default('PEN'),
  // Opcional: en PEN siempre es 1; en USD, si no viene, se usa el TC de venta del día
  exchangeRate: exchangeRateSchema.optional(),
  occurredOn: isoDateSchema,
  note: z.string().trim().max(500).nullish(),
  // Pago (i_owe) o cobro (owed_to_me) de una deuda
  debtId: uuidSchema.nullish(),
});

export const movementUpdateSchema = z
  .object({
    type: movementTypeSchema,
    categoryId: uuidSchema,
    amountOriginal: moneySchema,
    currency: currencySchema,
    exchangeRate: exchangeRateSchema,
    occurredOn: isoDateSchema,
    note: z.string().trim().max(500).nullable(),
    debtId: uuidSchema.nullable(),
  })
  .partial();

export const movementListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  type: movementTypeSchema.optional(),
  categoryId: uuidSchema.optional(),
  debtId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// --- Recurrentes ---
const recurringFields = {
  name: z.string().trim().min(1).max(80),
  type: movementTypeSchema,
  categoryId: uuidSchema,
  amountOriginal: moneySchema,
  currency: currencySchema,
  frequency: frequencySchema,
  // monthly: 1–31 obligatorio. biweekly: null (días 15 y último del mes)
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  startOn: isoDateSchema,
  endOn: isoDateSchema.nullable(),
  active: z.boolean(),
  debtId: uuidSchema.nullable(),
};

export const recurringCreateSchema = z
  .object({
    id: uuidSchema.optional(),
    ...recurringFields,
    currency: recurringFields.currency.default('PEN'),
    dayOfMonth: recurringFields.dayOfMonth.optional(),
    endOn: recurringFields.endOn.optional(),
    active: recurringFields.active.default(true),
    debtId: recurringFields.debtId.optional(),
  })
  .superRefine((value, ctx) => {
    const issue = recurringScheduleIssue({
      frequency: value.frequency,
      dayOfMonth: value.dayOfMonth ?? null,
      startOn: value.startOn,
      endOn: value.endOn ?? null,
    });
    if (issue) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
  });

// Parcial: la coherencia final (frecuencia vs. día) la valida la API sobre el registro combinado
export const recurringUpdateSchema = z.object(recurringFields).partial();

export interface RecurringSchedule {
  frequency: 'monthly' | 'biweekly';
  dayOfMonth: number | null;
  startOn: string;
  endOn: string | null;
}

// Reglas de coherencia del calendario de un recurrente. Devuelve null si es válido.
export function recurringScheduleIssue(schedule: RecurringSchedule): { path: string; message: string } | null {
  if (schedule.frequency === 'monthly' && schedule.dayOfMonth === null) {
    return { path: 'dayOfMonth', message: 'Los recurrentes mensuales necesitan dayOfMonth (1–31)' };
  }
  if (schedule.frequency === 'biweekly' && schedule.dayOfMonth !== null) {
    return { path: 'dayOfMonth', message: 'Los recurrentes quincenales se generan los días 15 y último; dayOfMonth debe ser null' };
  }
  if (schedule.endOn !== null && schedule.endOn < schedule.startOn) {
    return { path: 'endOn', message: 'endOn no puede ser anterior a startOn' };
  }
  return null;
}

// --- Deudas ---
export const debtCreateSchema = z.object({
  id: uuidSchema.optional(),
  direction: debtDirectionSchema,
  counterparty: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  initialAmount: moneySchema,
  currency: currencySchema.default('PEN'),
  installment: moneySchema.nullish(),
  expectedOn: isoDateSchema.nullish(),
  closedOn: isoDateSchema.nullish(),
});

// Dirección y moneda no se cambian: invalidarían los pagos ya registrados
export const debtUpdateSchema = z
  .object({
    counterparty: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable(),
    initialAmount: moneySchema,
    installment: moneySchema.nullable(),
    expectedOn: isoDateSchema.nullable(),
    closedOn: isoDateSchema.nullable(),
  })
  .partial();

// --- Montos rápidos ---
export const quickAmountCreateSchema = z.object({
  id: uuidSchema.optional(),
  amount: moneySchema,
  currency: currencySchema.default('PEN'),
  categoryId: uuidSchema.nullish(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const quickAmountUpdateSchema = z
  .object({
    amount: moneySchema,
    currency: currencySchema,
    categoryId: uuidSchema.nullable(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .partial();

// Tipos inferidos (salida ya validada y normalizada)
export type LoginInput = z.infer<typeof loginSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;
export type MovementUpdateInput = z.infer<typeof movementUpdateSchema>;
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
export type RecurringCreateInput = z.infer<typeof recurringCreateSchema>;
export type RecurringUpdateInput = z.infer<typeof recurringUpdateSchema>;
export type DebtCreateInput = z.infer<typeof debtCreateSchema>;
export type DebtUpdateInput = z.infer<typeof debtUpdateSchema>;
export type QuickAmountCreateInput = z.infer<typeof quickAmountCreateSchema>;
export type QuickAmountUpdateInput = z.infer<typeof quickAmountUpdateSchema>;
