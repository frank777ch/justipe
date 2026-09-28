import { createMMKV } from 'react-native-mmkv';
import type { Category, Debt, ExchangeRate, Movement, QuickAmount, Recurring } from '../api/types';

// Copia local de los datos en MMKV (almacenamiento clave-valor nativo y síncrono).
// Cada tabla se guarda como un JSON { id: fila }. Para un solo usuario son pocos
// miles de filas: cabe de sobra y se lee en milisegundos.
// En la vista previa web, MMKV usa localStorage.

export interface Tables {
  categories: Category;
  movements: Movement;
  recurring: Recurring;
  debts: Debt;
  quickAmounts: QuickAmount;
  exchangeRates: ExchangeRate;
}

export type TableName = keyof Tables;

export const TABLE_NAMES: TableName[] = ['categories', 'movements', 'recurring', 'debts', 'quickAmounts', 'exchangeRates'];

const storage = createMMKV({ id: 'justipe-data' });
const cache: { [K in TableName]?: Record<string, Tables[K]> } = {};

const tableKey = (table: TableName) => `table:${table}`;

// Clave primaria de cada tabla (el tipo de cambio se identifica por fecha)
export function rowKey<K extends TableName>(table: K, row: Tables[K]): string {
  return table === 'exchangeRates' ? (row as ExchangeRate).rateDate : (row as { id: string }).id;
}

function load<K extends TableName>(table: K): Record<string, Tables[K]> {
  const cached = cache[table];
  if (cached) return cached as Record<string, Tables[K]>;
  const raw = storage.getString(tableKey(table));
  const rows = raw ? (JSON.parse(raw) as Record<string, Tables[K]>) : {};
  (cache as Record<string, unknown>)[table] = rows;
  return rows;
}

function save<K extends TableName>(table: K, rows: Record<string, Tables[K]>): void {
  (cache as Record<string, unknown>)[table] = rows;
  storage.set(tableKey(table), JSON.stringify(rows));
}

export const localDb = {
  // Filas vivas (sin borrado lógico) de una tabla
  all<K extends TableName>(table: K): Tables[K][] {
    return Object.values(load(table)).filter((row) => !('deletedAt' in row) || row.deletedAt == null);
  },

  // Todas las filas, incluidas las borradas (p. ej. para mostrar el nombre de una categoría ya eliminada)
  allWithDeleted<K extends TableName>(table: K): Tables[K][] {
    return Object.values(load(table));
  },

  get<K extends TableName>(table: K, id: string): Tables[K] | undefined {
    return load(table)[id];
  },

  // Escritura local (cambio hecho en el teléfono)
  put<K extends TableName>(table: K, row: Tables[K]): void {
    save(table, { ...load(table), [rowKey(table, row)]: row });
  },

  // Borra la fila por completo (p. ej. un alta offline que se deshizo antes de enviarse)
  remove(table: TableName, id: string): void {
    const rows = { ...load(table) };
    delete rows[id];
    save(table, rows);
  },

  // Aplica filas que vienen del servidor. Las filas con cambios locales pendientes
  // (en "protectedIds") se conservan: el servidor aún no conoce esos cambios.
  applyServerRows<K extends TableName>(table: K, rows: Tables[K][], options: { replace: boolean; protectedIds: Set<string> }): void {
    const current = load(table);
    const next: Record<string, Tables[K]> = {};
    if (!options.replace) Object.assign(next, current);
    else {
      // En una copia completa, se conservan solo las filas locales pendientes
      for (const [key, row] of Object.entries(current)) {
        if (options.protectedIds.has(key)) next[key] = row;
      }
    }
    for (const row of rows) {
      const key = rowKey(table, row);
      if (options.protectedIds.has(key)) continue;
      next[key] = row;
    }
    save(table, next);
  },

  getString(key: string): string | undefined {
    return storage.getString(key);
  },

  setString(key: string, value: string): void {
    storage.set(key, value);
  },

  // Borra todos los datos locales (cierre de sesión explícito)
  clear(): void {
    storage.clearAll();
    for (const table of TABLE_NAMES) delete cache[table];
  },
};
