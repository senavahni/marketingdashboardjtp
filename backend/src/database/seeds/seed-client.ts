import '../../config/load-env';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildDatabaseUrl } from '../../config/database-url';
import { PrismaClient } from '../../generated/prisma/client';

/** PrismaClient untuk script CLI (seed, dsb.) tanpa bootstrap NestJS. */
export function createScriptClient(): PrismaClient {
  const url = buildDatabaseUrl(process.env);
  if (!url) throw new Error('DATABASE_URL atau POSTGRES_USER/POSTGRES_PASSWORD belum diisi');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed ditolak: NODE_ENV=production');
}
