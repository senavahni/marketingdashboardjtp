import { envSchema } from '../../src/config/env.schema';

const required = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  MCP_SERVER_API_KEY: 'b'.repeat(32),
  MCP_WEBHOOK_SECRET: 'c'.repeat(32),
  MCP_SERVICE_TOKEN: 'd'.repeat(32),
};

describe('MCP Intel environment configuration', () => {
  it('allows the feature key to be omitted', () => {
    expect(envSchema.safeParse(required).success).toBe(true);
  });

  it('accepts only the MCP client key format', () => {
    expect(envSchema.safeParse({ ...required, MCP_INTEL_API_KEY: `mcpk_abcd1234_${'x'.repeat(43)}` }).success).toBe(true);
    expect(envSchema.safeParse({ ...required, MCP_INTEL_API_KEY: 'mcpk_invalid' }).success).toBe(false);
  });
});
