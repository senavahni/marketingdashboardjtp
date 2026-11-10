import { ApiError, CLIENT_ID, refreshSession } from './api';
import { getToken } from './auth-store';
import type { UploadPurpose, UploadRef } from './mi-types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

export interface UploadProgress {
  loaded: number;
  total: number;
}

function sendOnce(ws: string, purpose: UploadPurpose, file: File, onProgress: (p: UploadProgress) => void, signal?: AbortSignal): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/workspaces/${ws}/uploads?purpose=${purpose}`);
    xhr.withCredentials = true;
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Client-Id', CLIENT_ID);
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : file.size });
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Koneksi terputus saat mengunggah'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Unggahan dibatalkan'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    // File dikirim sebagai body mentah (stream browser) — server meneruskan ke MCP tanpa buffer penuh
    xhr.send(file);
  });
}

/** Upload streaming ke `POST /workspaces/:ws/uploads` dengan progres byte (DSH-V1-06/09). */
export async function uploadFile(ws: string, purpose: UploadPurpose, file: File, onProgress: (p: UploadProgress) => void, signal?: AbortSignal): Promise<UploadRef> {
  let res = await sendOnce(ws, purpose, file, onProgress, signal);
  if (res.status === 401 && (await refreshSession())) res = await sendOnce(ws, purpose, file, onProgress, signal);
  const parsed = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : null;
  if (res.status < 200 || res.status >= 300) {
    const err = (parsed?.error ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'INTERNAL_ERROR', uploadErrorMessage(res.status, err.message), err.details);
  }
  return parsed as unknown as UploadRef;
}

/** Pesan inline zona drop (matriks state §E "Upload ditolak"). */
export function uploadErrorMessage(status: number, fallback?: string): string {
  if (status === 413) return 'File terlalu besar — maks 100 MB (PDF) / 20 MB (XLSX/CSV)';
  if (status === 415) return 'Isi file tidak sesuai ekstensi atau jenis file tidak didukung';
  if (status === 429) return 'Terlalu banyak unggahan — coba lagi sebentar lagi';
  if (status === 403) return 'Anda tidak memiliki izin mengunggah file ini';
  return fallback ?? `Unggahan gagal (${status})`;
}
