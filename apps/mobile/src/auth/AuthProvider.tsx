import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError, createApiRequest, normalizeBaseUrl, type ApiRequest } from '../api/client';
import type { LoginResponse } from '../api/types';
import { getItem, removeItem, setItem, storageKeys } from '../lib/storage';
import { localDb } from '../offline/localDb';
import { syncEngine } from '../offline/syncEngine';

// Sesión del único usuario: URL de la API + JWT guardados en el almacenamiento seguro.

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  apiUrl: string;
  // Cliente autenticado; lanza ApiRequestError
  api: ApiRequest;
  login: (apiUrl: string, password: string) => Promise<void>;
  // clearData: borra también la copia local y los cambios pendientes
  logout: (options?: { clearData?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [token, setToken] = useState<string | null>(null);

  // Restaura la sesión guardada al abrir la app
  useEffect(() => {
    void (async () => {
      const [savedToken, savedUrl] = await Promise.all([getItem(storageKeys.token), getItem(storageKeys.apiUrl)]);
      if (savedUrl) setApiUrl(savedUrl);
      setToken(savedToken);
      setStatus(savedToken ? 'signedIn' : 'signedOut');
    })();
  }, []);

  const logout = useCallback(
    async ({ clearData = false }: { clearData?: boolean } = {}) => {
      await removeItem(storageKeys.token);
      if (clearData) {
        localDb.clear();
        syncEngine.reset();
        queryClient.clear();
      }
      setToken(null);
      setStatus('signedOut');
    },
    [queryClient],
  );

  const login = useCallback(async (url: string, password: string) => {
    const baseUrl = normalizeBaseUrl(url);
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new ApiRequestError(0, 'invalid_url', 'La URL debe empezar con http:// o https://');
    }
    const request = createApiRequest({ baseUrl, token: null });
    const { token: newToken } = await request<LoginResponse>('POST', '/auth/login', { password });
    // Si cambia el servidor, la copia local ya no corresponde
    const previousUrl = await getItem(storageKeys.apiUrl);
    if (previousUrl && previousUrl !== baseUrl) {
      localDb.clear();
      syncEngine.reset();
      queryClient.clear();
    }
    await Promise.all([setItem(storageKeys.token, newToken), setItem(storageKeys.apiUrl, baseUrl)]);
    setApiUrl(baseUrl);
    setToken(newToken);
    setStatus('signedIn');
  }, [queryClient]);

  const api = useMemo(
    // Token vencido: se pide la contraseña otra vez, pero se conservan los datos y pendientes
    () => createApiRequest({ baseUrl: apiUrl, token, onUnauthorized: () => void logout() }),
    [apiUrl, token, logout],
  );

  const value = useMemo(() => ({ status, apiUrl, api, login, logout }), [status, apiUrl, api, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
