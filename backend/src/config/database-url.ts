/**
 * Menyusun DATABASE_URL. Prioritas:
 * 1. DATABASE_URL (jika diisi)
 * 2. POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST (default localhost),
 *    POSTGRES_PORT (default 5432), POSTGRES_DB (default matrika_dashboard)
 */
export function buildDatabaseUrl(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  if (!user || !password) return '';
  const host = env.POSTGRES_HOST || 'localhost';
  const port = env.POSTGRES_PORT || '5432';
  const db = env.POSTGRES_DB || 'matrika_dashboard';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}
