import { AppException } from '../../src/common/exceptions/app.exception';
import { IntelLlmKeysService } from '../../src/modules/intel/intel-llm-keys.service';
import { llmKeyAgentKeySchema, llmKeyRotateResultSchema } from '../../src/shared/schemas/llm-key.schema';

// Rotasi key Gateway per agent: hanya Admin/Owner, diteruskan ke tool MCP, hanya prefix yang kembali

const ws = '44444444-4444-4444-8444-444444444444';
const user = { id: '77777777-7777-4777-8777-777777777777', username: 'owner', display_name: 'Owner' };
const rotated = { agent_key: 'analyst', key_prefix: 'lgw_abcd1234', rotated_at: '2026-11-06T01:00:00Z', old_key_revoked: true };

function harness(enabled = true) {
  const access = { assertWorkspace: jest.fn().mockResolvedValue({ role: 'admin' }) };
  const mcp = { call: jest.fn().mockResolvedValue(rotated) };
  const service = new IntelLlmKeysService({ isIntelEnabled: enabled } as never, access as never, mcp as never);
  return { service, access, mcp };
}

describe('IntelLlmKeysService', () => {
  it('wajib admin, meneruskan agent_key ke tool MCP, dan mengembalikan prefix saja', async () => {
    const { service, access, mcp } = harness();
    const out = await service.rotate(user, ws, 'analyst', 'req-1');
    expect(access.assertWorkspace).toHaveBeenCalledWith(user.id, ws, 'admin');
    expect(mcp.call).toHaveBeenCalledWith('intel_llm_key_rotate', { agent_key: 'analyst' }, expect.anything(), 'req-1', expect.any(Number));
    expect(out).toEqual(rotated);
  });

  it('member ditolak sebelum memanggil MCP; modul nonaktif → FEATURE_DISABLED', async () => {
    const h = harness();
    h.access.assertWorkspace.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(h.service.rotate(user, ws, 'analyst')).rejects.toThrow('FORBIDDEN');
    expect(h.mcp.call).not.toHaveBeenCalled();
    const disabled = harness(false);
    await expect(disabled.service.rotate(user, ws, 'analyst')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(disabled.access.assertWorkspace).not.toHaveBeenCalled();
  });

  it('kegagalan Admin API Gateway (LLM_ERROR) dijelaskan tanpa detail upstream dan status dipertahankan', async () => {
    const h = harness();
    h.mcp.call.mockRejectedValue(new AppException('LLM_ERROR', 'Model LLM gagal memberi jawaban yang valid, coba lagi', 504));
    const error = await h.service.rotate(user, ws, 'analyst').catch((e: AppException) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('LLM_ERROR');
    expect((error as AppException).getStatus()).toBe(504);
    expect((error as AppException).message).toMatch(/admin key Gateway/);
  });

  it('error lain dari MCP diteruskan apa adanya', async () => {
    const h = harness();
    const notFound = new AppException('NOT_FOUND', 'Data tidak ditemukan di layanan MCP', 404);
    h.mcp.call.mockRejectedValue(notFound);
    await expect(h.service.rotate(user, ws, 'analyst')).rejects.toBe(notFound);
  });
});

describe('llm-key schemas', () => {
  it.each(['analyst', 'system', 'agent-1', 'a_b', 'ab'])('menerima agent_key %s', (value) => {
    expect(llmKeyAgentKeySchema.safeParse(value).success).toBe(true);
  });

  it.each(['a', 'A', 'Bad Key', '../x', 'a/b', 'x'.repeat(65), ''])('menolak agent_key %j', (value) => {
    expect(llmKeyAgentKeySchema.safeParse(value).success).toBe(false);
  });

  it('hasil rotasi menolak key lengkap (hanya prefix lgw_ + 8 karakter)', () => {
    expect(llmKeyRotateResultSchema.safeParse(rotated).success).toBe(true);
    const full = `lgw_abcd1234_${'A'.repeat(43)}`;
    expect(llmKeyRotateResultSchema.safeParse({ ...rotated, key_prefix: full }).success).toBe(false);
  });
});
