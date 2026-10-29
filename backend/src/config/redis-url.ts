/**
 * Menyusun REDIS_URL. Prioritas:
 * 1. REDIS_URL (jika diisi)
 * 2. REDIS_HOST (default localhost), REDIS_PORT (default 6379), REDIS_USERNAME, REDIS_PASSWORD, REDIS_DB (default 0)
 */
export function buildRedisUrl(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  if (env.REDIS_URL) return env.REDIS_URL;
  const host = env.REDIS_HOST || 'localhost';
  const port = env.REDIS_PORT || '6379';
  const db = env.REDIS_DB || '0';
  const user = env.REDIS_USERNAME ? encodeURIComponent(env.REDIS_USERNAME) : '';
  const pass = env.REDIS_PASSWORD ? encodeURIComponent(env.REDIS_PASSWORD) : '';
  const auth = user || pass ? `${user}:${pass}@` : '';
  return `redis://${auth}${host}:${port}/${db}`;
}
