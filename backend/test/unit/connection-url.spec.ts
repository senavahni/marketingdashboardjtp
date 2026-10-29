import { buildDatabaseUrl } from '../../src/config/database-url';
import { buildRedisUrl } from '../../src/config/redis-url';

describe('URL koneksi dari .env', () => {
  it('Redis: dari variabel terpisah, kredensial di-encode', () => {
    expect(buildRedisUrl({ REDIS_HOST: 'host.docker.internal', REDIS_PORT: '6379', REDIS_USERNAME: 'app', REDIS_PASSWORD: 'p@ss:w/rd' })).toBe(
      'redis://app:p%40ss%3Aw%2Frd@host.docker.internal:6379/0',
    );
    expect(buildRedisUrl({})).toBe('redis://localhost:6379/0');
    expect(buildRedisUrl({ REDIS_PASSWORD: 'x' })).toBe('redis://:x@localhost:6379/0');
    expect(buildRedisUrl({ REDIS_URL: 'redis://a:b@c:1/2' })).toBe('redis://a:b@c:1/2');
  });

  it('Postgres: dari variabel terpisah', () => {
    expect(buildDatabaseUrl({ POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p#1', POSTGRES_HOST: 'h' })).toBe('postgresql://u:p%231@h:5432/matrika_dashboard');
  });
});
