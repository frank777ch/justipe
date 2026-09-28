// Cliente HTTP mínimo para la API de Justipe (fetch nativo, sin dependencias)

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token: string | null;
  // Se llama cuando la API responde 401 (token vencido o inválido)
  onUnauthorized?: () => void;
  timeoutMs?: number;
}

export type ApiRequest = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function createApiRequest({ baseUrl, token, onUnauthorized, timeoutMs = 15_000 }: ApiClientOptions): ApiRequest {
  return async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiRequestError(0, 'network_error', 'No se pudo conectar con el servidor');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const data = text ? safeJson(text) : null;

    if (!response.ok) {
      if (response.status === 401 && token) onUnauthorized?.();
      const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
      throw new ApiRequestError(response.status, error?.code ?? 'http_error', error?.message ?? `Error ${response.status}`, error?.details);
    }
    return data as T;
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
