import { AppException } from '../../src/common/exceptions/app.exception';
import { McpCallError } from '../../src/modules/agent-runs/mcp-client.service';
import { mapIntelMcpError } from '../../src/modules/intel/intel-mcp.errors';

describe('mapIntelMcpError', () => {
  it.each([
    ['MCP_UNAVAILABLE', 502],
    ['INTERNAL', 502],
    ['AGENT_NOT_CAPABLE', 422],
    ['UNKNOWN_AGENT', 422],
    ['AGENT_INACTIVE', 422],
    ['COST_CONFIRMATION_REQUIRED', 422],
    ['SOURCE_UNAVAILABLE', 422],
    ['VALIDATION_ERROR', 400],
    ['RATE_LIMITED', 429],
    ['NOT_FOUND', 404],
    ['RESULT_EXPIRED', 410],
    ['JOB_NOT_ACTIVE', 409],
  ])('maps %s to HTTP %i', (code, status) => {
    const mapped = mapIntelMcpError(new McpCallError(code, 'MCP error', false));

    expect(mapped).toBeInstanceOf(AppException);
    expect(mapped.getStatus()).toBe(status);
    expect(mapped.code).toBe(code === 'INTERNAL' ? 'MCP_ERROR' : code);
  });

  it('kuota Gateway & output LLM tidak valid punya pesan yang bisa ditindaklanjuti (tanpa detail upstream)', () => {
    const quota = mapIntelMcpError(new McpCallError('BUDGET_EXCEEDED', 'Kuota project di LLM Gateway habis', false));
    expect(quota.code).toBe('LLM_QUOTA_EXCEEDED');
    expect(quota.getStatus()).toBe(429);
    expect(quota.message).toMatch(/Kuota LLM Gateway habis/);
    const upstream = mapIntelMcpError(new McpCallError('UPSTREAM_ERROR', 'provider detail', true));
    expect(upstream.code).toBe('LLM_ERROR');
    expect(upstream.message).not.toContain('provider detail');
  });

  it('maps unknown MCP errors to MCP_ERROR without exposing upstream details', () => {
    const mapped = mapIntelMcpError(new McpCallError('SECRET_UPSTREAM_ERROR', 'provider detail', false));

    expect(mapped.code).toBe('MCP_ERROR');
    expect(mapped.message).toBe('Layanan MCP gagal memproses permintaan');
    expect(mapped.message).not.toContain('provider detail');
  });
});
