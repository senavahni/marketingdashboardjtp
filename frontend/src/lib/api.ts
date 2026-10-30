import { getToken, useAuth } from './auth-store';
import { uuid } from './utils';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';
/** ID unik per tab — dipakai backend sebagai origin_client_id agar echo event sendiri bisa diabaikan. */
export const CLIENT_ID = uuid();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: any,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

interface Options {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  keepalive?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let refreshing: Promise<boolean> | null = null;

/** Refresh access token (single-flight: request paralel menunggu satu proses refresh). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Client-Id': CLIENT_ID } });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token: string };
      useAuth.getState().setSession(data.access_token);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const send = () => {
    const token = getToken();
    return fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal,
      keepalive: opts.keepalive,
      headers: {
        'X-Client-Id': CLIENT_ID,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send();
    else useAuth.getState().setAnonymous();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'INTERNAL_ERROR', err.message ?? `Request gagal (${res.status})`, err.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const issues = err.details?.issues as { path: string; message: string }[] | undefined;
    return issues?.length ? `${err.message}: ${issues[0].message}` : err.message;
  }
  return err instanceof Error ? err.message : 'Terjadi kesalahan';
}
