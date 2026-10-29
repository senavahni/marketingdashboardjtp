import { safeEqual, signMcpPayload, verifyMcpSignature } from '../../src/utils/helpers/crypto.util';

describe('signature webhook MCP', () => {
  const secret = 's'.repeat(40);
  const body = Buffer.from('{"event_id":"x"}');
  const now = 1_800_000_000;
  const ts = String(now);
  const sig = signMcpPayload(secret, ts, body);

  it('format sha256=<hex>', () => expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/));

  it('valid dengan secret aktif atau secret sebelumnya (rotasi)', () => {
    expect(verifyMcpSignature({ secrets: [secret], timestamp: ts, signature: sig, rawBody: body, nowSec: now })).toBe('ok');
    expect(verifyMcpSignature({ secrets: ['baru'.repeat(10), secret], timestamp: ts, signature: sig, rawBody: body, nowSec: now })).toBe('ok');
  });

  it('menolak body diubah, signature salah, header hilang, atau timestamp lama', () => {
    expect(verifyMcpSignature({ secrets: [secret], timestamp: ts, signature: sig, rawBody: Buffer.from('{}'), nowSec: now })).toBe('invalid');
    expect(verifyMcpSignature({ secrets: [secret], timestamp: ts, signature: 'sha256=00', rawBody: body, nowSec: now })).toBe('invalid');
    expect(verifyMcpSignature({ secrets: [secret], timestamp: undefined, signature: sig, rawBody: body, nowSec: now })).toBe('missing');
    expect(verifyMcpSignature({ secrets: [secret], timestamp: ts, signature: sig, rawBody: body, nowSec: now + 301 })).toBe('expired');
  });

  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
