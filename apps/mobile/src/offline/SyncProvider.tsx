import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { syncEngine, type SyncState } from './syncEngine';

// Cuándo se sincroniza:
// - al iniciar sesión / abrir la app
// - justo después de cada cambio local
// - al volver la app al primer plano o recuperar la conexión (web)
// - cada 30 s si hay pendientes o no hubo red; cada 5 min en cualquier caso

const RETRY_INTERVAL_MS = 30_000;
const REFRESH_INTERVAL_MS = 5 * 60_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { api, status } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    syncEngine.onDataChanged = () => void queryClient.invalidateQueries({ queryKey: ['local'] });
  }, [queryClient]);

  useEffect(() => {
    if (status !== 'signedIn') {
      syncEngine.requestSync = async () => {};
      return;
    }
    syncEngine.requestSync = () => syncEngine.sync(api);
    const run = () => void syncEngine.sync(api);
    run();

    const appState = AppState.addEventListener('change', (state) => state === 'active' && run());
    const onOnline = () => run();
    globalThis.addEventListener?.('online', onOnline);
    const timer = setInterval(() => {
      const state = syncEngine.getState();
      const sinceLast = state.lastSyncAt ? Date.now() - Date.parse(state.lastSyncAt) : Infinity;
      if (state.pending > 0 || state.status === 'offline' || state.status === 'error' || sinceLast > REFRESH_INTERVAL_MS) run();
    }, RETRY_INTERVAL_MS);

    return () => {
      appState.remove();
      globalThis.removeEventListener?.('online', onOnline);
      clearInterval(timer);
    };
  }, [status, api]);

  return <>{children}</>;
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (listener) => syncEngine.subscribe(listener),
    () => syncEngine.getState(),
  );
}

// Para "tirar hacia abajo para actualizar": sincroniza y muestra el indicador mientras dura
export function useSyncNow(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void syncEngine.requestSync().finally(() => setRefreshing(false));
  }, []);
  return { refreshing, onRefresh };
}
