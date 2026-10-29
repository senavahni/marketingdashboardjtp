import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import { defineConfig } from 'prisma/config';
import { buildDatabaseUrl } from './src/config/database-url';

// backend/.env dimuat oleh 'dotenv/config'; .env di root project sebagai fallback (tidak menimpa).
loadDotenv({ path: path.resolve(__dirname, '../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: buildDatabaseUrl(process.env) },
});
