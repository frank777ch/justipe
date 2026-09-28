import { pgEnum, timestamp } from 'drizzle-orm/pg-core';

// Enums compartidos por varias tablas.
// Las monedas usan código ISO 4217 en la BD; la app muestra "S/" y "US$".
export const currencyEnum = pgEnum('currency', ['PEN', 'USD']);
export const movementTypeEnum = pgEnum('movement_type', ['expense', 'income']);
// monthly: un día fijo del mes. biweekly: los días 15 y último de cada mes.
export const frequencyEnum = pgEnum('frequency', ['monthly', 'biweekly']);
// i_owe: lo que yo debo. owed_to_me: lo que me deben.
export const debtDirectionEnum = pgEnum('debt_direction', ['i_owe', 'owed_to_me']);
export const rateSourceEnum = pgEnum('rate_source', ['api', 'manual']);

export type Currency = (typeof currencyEnum.enumValues)[number];
export type MovementType = (typeof movementTypeEnum.enumValues)[number];
export type Frequency = (typeof frequencyEnum.enumValues)[number];
export type DebtDirection = (typeof debtDirectionEnum.enumValues)[number];
export type RateSource = (typeof rateSourceEnum.enumValues)[number];

// Columnas de auditoría y sincronización offline presentes en toda tabla sincronizable.
// - updated_at lo mantiene un trigger de la BD (ver migración 0001) para que el
//   cliente pueda pedir "todo lo que cambió desde X" sin depender del reloj del móvil.
// - deleted_at implementa borrado lógico: los borrados también se sincronizan.
export const syncColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};
