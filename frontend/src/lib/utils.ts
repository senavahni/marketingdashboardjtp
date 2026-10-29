import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export const uuid = (): string => crypto.randomUUID();

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
