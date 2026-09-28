import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError, createApiRequest, normalizeBaseUrl, type ApiRequest } from '../api/client';
import type { LoginResponse } from '../api/types';
import { getItem, removeItem, setItem, storageKeys } from '../lib/storage';

// Sesión del único usuario: URL de la API + JWT guardados en el almacenamiento seguro.

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  apiUrl: string;
  // Cliente autenticado; lanza ApiRequestError
  api: ApiRequest;
  login: (apiUrl: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const logout = useCallback(async () => {
    await removeItem(storageKeys.token);
    setToken(null);
    setStatus('signedOut');
    queryClient.clear();
  }, [queryClient]);

  const login = useCallback(async (url: string, password: string) => {
    const baseUrl = normalizeBaseUrl(url);
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new ApiRequestError(0, 'invalid_url', 'La URL debe empezar con http:// o https://');
    }
    const request = createApiRequest({ baseUrl, token: null });
    const { token: newToken } = await request<LoginResponse>('POST', '/auth/login', { password });
    await Promise.all([setItem(storageKeys.token, newToken), setItem(storageKeys.apiUrl, baseUrl)]);
    setApiUrl(baseUrl);
    setToken(newToken);
    setStatus('signedIn');
  }, []);

  const api = useMemo(
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
