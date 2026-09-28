import { ApiRequestError, type ApiRequest } from '../api/client';
import type { SyncResponse } from '../api/types';
import { localDb, type TableName, type Tables } from './localDb';
import { ENDPOINTS, outbox, type OutboxOp } from './outbox';

// Motor de sincronización:
//   1) envía la cola de cambios locales (en orden), 2) trae los cambios del servidor.
// Si no hay red se detiene sin perder nada; se reintenta más tarde.
// Conflictos: gana la última escritura (un solo usuario, casi nunca ocurren).

export interface FailedChange {
  op: OutboxOp;
  message: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt: string | null;
  pending: number;
  lastError: string | null;
  // Cambios que el servidor rechazó (p. ej. categoría borrada en otro lado)
  failed: FailedChange[];
}

const CURSOR_KEY = 'sync:cursor';
const LAST_SYNC_KEY = 'sync:lastSyncAt';

type Listener = (state: SyncState) => void;

class SyncEngine {
  private state: SyncState = {
    status: 'idle',
    lastSyncAt: localDb.getString(LAST_SYNC_KEY) ?? null,
    pending: outbox.list().length,
    lastError: null,
    failed: [],
  };
  private listeners = new Set<Listener>();
  private running: Promise<void> | null = null;
  private again = false;
  // Se llama después de cada cambio en los datos locales (refresca la UI)
  onDataChanged: () => void = () => {};
  // Lo conecta SyncProvider: pide una sincronización con el cliente autenticado actual
  requestSync: () => Promise<void> = async () => {};

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch, pending: outbox.list().length };
    for (const listener of this.listeners) listener(this.state);
  }

  // Notifica un cambio local: refresca la UI y trata de enviarlo de inmediato
  touch(): void {
    this.setState({});
    this.onDataChanged();
    void this.requestSync();
  }

  dismissFailed(): void {
    this.setState({ failed: [] });
  }

  // Sincroniza; si ya hay una sincronización en curso, agenda otra al terminar
  sync(api: ApiRequest): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce(api);
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce(api: ApiRequest): Promise<void> {
    this.setState({ status: 'syncing' });
    try {
      await this.flushOutbox(api);
      await this.pull(api);
      const now = new Date().toISOString();
      localDb.setString(LAST_SYNC_KEY, now);
      this.setState({ status: 'idle', lastSyncAt: now, lastError: null });
    } catch (error) {
      const offline = error instanceof ApiRequestError && error.status === 0;
      this.setState({
        status: offline ? 'offline' : 'error',
        lastError: offline ? null : error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.onDataChanged();
    }
  }

  private async flushOutbox(api: ApiRequest): Promise<void> {
    for (const op of outbox.list()) {
      try {
        const row = await sendOp(api, op);
        outbox.remove(op.opId);
        // La versión del servidor reemplaza la local, salvo que queden más cambios pendientes del mismo registro
        if (row) {
          localDb.applyServerRows(op.table, [row as Tables[typeof op.table]], { replace: false, protectedIds: outbox.pendingIds() });
        }
      } catch (error) {
        if (!(error instanceof ApiRequestError)) throw error;
        // Sin red, sesión vencida o error del servidor: se reintenta después
        if (error.status === 0 || error.status === 401 || error.status >= 500) throw error;
        outbox.remove(op.opId);
        if (isAlreadyApplied(op, error)) continue;
        // Rechazo definitivo (422, 409...): se descarta y se avisa
        if (op.kind === 'create') localDb.remove(op.table, op.id);
        this.setState({ failed: [...this.state.failed, { op, message: error.message }] });
      }
      this.setState({});
    }
  }

  private async pull(api: ApiRequest): Promise<void> {
    const cursor = localDb.getString(CURSOR_KEY);
    const query = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
    const response = await api<SyncResponse>('GET', `/sync${query}`);
    const protectedIds = outbox.pendingIds();
    const replace = response.full;
    const apply = <K extends TableName>(table: K, rows: Tables[K][]) => localDb.applyServerRows(table, rows, { replace, protectedIds });

    apply('categories', response.changes.categories);
    apply('movements', response.changes.movements);
    apply('recurring', response.changes.recurring);
    apply('debts', response.changes.debts);
    apply('quickAmounts', response.changes.quickAmounts);
    apply('exchangeRates', response.changes.exchangeRates);
    localDb.setString(CURSOR_KEY, response.cursor);
  }

  // Tras cerrar sesión con borrado de datos: vuelve al estado inicial
  reset(): void {
    this.state = { status: 'idle', lastSyncAt: null, pending: 0, lastError: null, failed: [] };
    for (const listener of this.listeners) listener(this.state);
  }
}

async function sendOp(api: ApiRequest, op: OutboxOp): Promise<unknown> {
  const endpoint = ENDPOINTS[op.table];
  switch (op.kind) {
    case 'create':
      return api('POST', endpoint, { id: op.id, ...op.payload });
    case 'update':
      return api('PATCH', `${endpoint}/${op.id}`, op.payload);
    case 'delete':
      await api('DELETE', `${endpoint}/${op.id}`);
      return null;
  }
}

// Respuestas que significan "ya estaba hecho": no es un error
function isAlreadyApplied(op: OutboxOp, error: ApiRequestError): boolean {
  if (op.kind === 'delete') return error.status === 404 || error.code === 'already_deleted';
  return false;
}

export const syncEngine = new SyncEngine();
