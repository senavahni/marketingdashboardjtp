import { z } from 'zod';
import { buildDatabaseUrl } from './database-url';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const secret = (name: string) => z.string().min(32, `${name} minimal 32 karakter (buat dengan: openssl rand -base64 48)`);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL atau POSTGRES_USER/POSTGRES_PASSWORD wajib diisi'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]?$/, 'format: 900, 30s, 15m, 1h, 1d').default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.default(false),

  MCP_SERVER_URL: z.url().default('http://localhost:4100/mcp'),
  MCP_SERVER_API_KEY: secret('MCP_SERVER_API_KEY'),
  MCP_WEBHOOK_SECRET: secret('MCP_WEBHOOK_SECRET'),
  MCP_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),
  MCP_SERVICE_TOKEN: secret('MCP_SERVICE_TOKEN'),
  MCP_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  MCP_ESTIMATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MCP_DISPATCH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  AGENT_RUN_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(120),

  RUN_WORKERS: bool.default(true),
  RATE_LIMIT_ENABLED: bool.default(true),
  FEATURE_AI_PROMPT_BLOCK: bool.default(false),
  SWAGGER_ENABLED: bool.default(true),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_DEMO_PASSWORD: z.string().min(10).default('Demo12345!'),
});

export type Env = z.infer<typeof envSchema>;

/** Validasi env; melempar Error berisi daftar masalah (aplikasi gagal start). */
export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  // Abaikan variabel kosong agar default berlaku (mis. COOKIE_DOMAIN=)
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && v !== '') cleaned[k] = v;
  cleaned.DATABASE_URL = buildDatabaseUrl(cleaned);

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Konfigurasi environment tidak valid:\n${lines.join('\n')}`);
  }
  return result.data;
}
