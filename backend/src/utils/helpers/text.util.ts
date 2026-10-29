// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Membuang karakter kontrol (kecuali \n dan \t). */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, '');
}

export function excerpt(value: string, max = 140): string {
  const single = value.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/** URL aman: hanya http/https (dan opsional mailto). */
export function isSafeUrl(value: string, allowMailto = false): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || (allowMailto && url.protocol === 'mailto:');
  } catch {
    return false;
  }
}
