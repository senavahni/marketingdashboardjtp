import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import { defineConfig } from 'prisma/config';
import { buildDatabaseUrl } from './src/config/database-url';

// Satu .env di root project (tidak menimpa variabel yang sudah ada, mis. dari docker compose)
loadDotenv({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: buildDatabaseUrl(process.env) },
});
