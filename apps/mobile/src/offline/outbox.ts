import { randomUUID } from 'expo-crypto';
import { localDb, type TableName } from './localDb';

// Cola de cambios hechos en el teléfono que aún no llegaron al servidor.
// Se guarda en MMKV, así sobrevive a cerrar la app, y se envía en orden.

export type SyncableTable = Exclude<TableName, 'exchangeRates'>;

export interface OutboxOp {
  opId: string;
  kind: 'create' | 'update' | 'delete';
  table: SyncableTable;
  id: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

// Endpoint REST de cada tabla
export const ENDPOINTS: Record<SyncableTable, string> = {
  categories: '/categories',
  movements: '/movements',
  recurring: '/recurring',
  debts: '/debts',
  quickAmounts: '/quick-amounts',
};

const OUTBOX_KEY = 'sync:outbox';

export const outbox = {
  list(): OutboxOp[] {
    const raw = localDb.getString(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxOp[]) : [];
  },

  save(ops: OutboxOp[]): void {
    localDb.setString(OUTBOX_KEY, JSON.stringify(ops));
  },

  // Ids con cambios pendientes: el servidor no debe pisarlos al sincronizar
  pendingIds(): Set<string> {
    return new Set(this.list().map((op) => op.id));
  },

  // Encola un cambio combinándolo con los pendientes del mismo registro:
  // - update sobre un create pendiente -> se fusiona en el create
  // - update sobre un update pendiente -> se fusionan
  // - delete sobre un create pendiente -> ambos desaparecen (nunca llegó al servidor)
  // Devuelve "discarded" cuando el registro nunca existió en el servidor.
  enqueue(op: Omit<OutboxOp, 'opId' | 'createdAt'>): 'queued' | 'discarded' {
    const ops = this.list();
    const pendingCreate = ops.find((o) => o.id === op.id && o.table === op.table && o.kind === 'create');

    if (op.kind === 'delete' && pendingCreate) {
      this.save(ops.filter((o) => !(o.id === op.id && o.table === op.table)));
      return 'discarded';
    }
    if (op.kind === 'update') {
      const target = pendingCreate ?? ops.find((o) => o.id === op.id && o.table === op.table && o.kind === 'update');
      if (target) {
        target.payload = { ...target.payload, ...op.payload };
        this.save(ops);
        return 'queued';
      }
    }
    // Un delete deja sin efecto los updates pendientes del mismo registro
    const remaining = op.kind === 'delete' ? ops.filter((o) => !(o.id === op.id && o.table === op.table)) : ops;
    this.save([...remaining, { ...op, opId: randomUUID(), createdAt: new Date().toISOString() }]);
    return 'queued';
  },

  remove(opId: string): void {
    this.save(this.list().filter((op) => op.opId !== opId));
  },
};
