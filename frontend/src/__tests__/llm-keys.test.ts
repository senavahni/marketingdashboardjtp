import { describe, expect, it } from 'vitest';
import { canRotateKey, rotationOutcome } from '../lib/llm-keys';

const result = { agent_key: 'analyst', key_prefix: 'lgw_abcd1234', rotated_at: '2026-11-06T01:00:00Z', old_key_revoked: true };

describe('canRotateKey', () => {
  it('hanya agent yang memakai key sendiri', () => {
    expect(canRotateKey({ key_source: 'agent' })).toBe(true);
    expect(canRotateKey({ key_source: 'system' })).toBe(false);
    expect(canRotateKey({ key_source: 'env' })).toBe(false);
  });
});

describe('rotationOutcome', () => {
  it('sukses menyebut prefix baru dan bahwa key lama dicabut', () => {
    const out = rotationOutcome('Analis', result);
    expect(out.level).toBe('success');
    expect(out.message).toContain('lgw_abcd1234');
    expect(out.message).toContain('Key lama sudah dicabut');
  });

  it('key lama gagal dicabut → peringatan agar dicabut manual', () => {
    const out = rotationOutcome('Analis', { ...result, old_key_revoked: false });
    expect(out.level).toBe('warning');
    expect(out.message).toMatch(/cabut manual/i);
  });
});
