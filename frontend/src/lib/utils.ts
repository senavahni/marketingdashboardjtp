import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** UUID v4. `crypto.randomUUID` hanya ada di secure context (HTTPS/localhost); saat dibuka lewat http://IP-LAN pakai getRandomValues. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function initials(name: string | null | undefined): string {
  return (name ?? '?')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Waktu relatif berbahasa Indonesia ("5 menit lalu"). */
export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'baru saja';
  const steps: [number, string][] = [
    [60, 'menit'],
    [3600, 'jam'],
    [86400, 'hari'],
    [604800, 'minggu'],
    [2592000, 'bulan'],
    [31536000, 'tahun'],
  ];
  let label = 'menit';
  let value = s / 60;
  for (const [sec, name] of steps) {
    if (s >= sec) {
      label = name;
      value = s / sec;
    }
  }
  return `${Math.max(1, Math.floor(value))} ${label} lalu`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
}
