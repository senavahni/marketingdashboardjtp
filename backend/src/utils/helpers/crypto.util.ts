import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Perbandingan string constant-time (aman dari timing attack). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Signature webhook MCP: "sha256=" + HMAC_SHA256(secret, "<timestamp>.<raw_body>"). */
export function signMcpPayload(secret: string, timestamp: string, rawBody: string | Buffer): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

export interface SignatureCheckInput {
  secrets: string[];
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer | undefined;
  toleranceSec?: number;
  nowSec?: number;
}

export type SignatureCheckResult = 'ok' | 'missing' | 'expired' | 'invalid';

export function verifyMcpSignature(input: SignatureCheckInput): SignatureCheckResult {
  const { secrets, timestamp, signature, rawBody } = input;
  if (!timestamp || !signature || !rawBody) return 'missing';
  const ts = Number(timestamp);
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (input.toleranceSec ?? 300)) return 'expired';
  return secrets.some((s) => s && safeEqual(signMcpPayload(s, timestamp, rawBody), signature)) ? 'ok' : 'invalid';
}
