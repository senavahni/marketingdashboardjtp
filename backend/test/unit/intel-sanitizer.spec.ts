import { redactGatewayKeys } from '../../src/modules/intel/intel-sanitizer';

describe('Gateway key response sanitization', () => {
  it('redacts full gateway keys recursively while preserving key prefixes and other values', () => {
    const fullKey = `lgw_prefix8_${'s'.repeat(43)}`;
    expect(
      redactGatewayKeys({
        key_prefix: 'lgw_prefix8',
        last_error: `request failed with ${fullKey}`,
        nested: [fullKey],
      }),
    ).toEqual({
      key_prefix: 'lgw_prefix8',
      last_error: 'request failed with [REDACTED_KEY]',
      nested: ['[REDACTED_KEY]'],
    });
  });

  it('redacts a full MCP client key without redacting its prefix', () => {
    const fullKey = `mcpk_abcd1234_${'x'.repeat(43)}`;
    expect(redactGatewayKeys({ prefix: 'mcpk_abcd1234', token: fullKey })).toEqual({
      prefix: 'mcpk_abcd1234',
      token: '[REDACTED_KEY]',
    });
  });
});
