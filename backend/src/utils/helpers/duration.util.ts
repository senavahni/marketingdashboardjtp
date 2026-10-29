/** Mengubah durasi seperti "900", "30s", "15m", "1h", "7d" menjadi detik. */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd]?)$/.exec(value.trim());
  if (!match) throw new Error(`Format durasi tidak valid: ${value}`);
  const n = Number(match[1]);
  const unit = match[2] || 's';
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit as 's' | 'm' | 'h' | 'd'];
  return n * factor;
}
