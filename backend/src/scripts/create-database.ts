import '../config/load-env';
import { Client } from 'pg';
import { buildDatabaseUrl } from '../config/database-url';

/** Membuat database (dari DATABASE_URL / POSTGRES_DB) jika belum ada. Jalankan: npm run db:create */
async function main(): Promise<void> {
  const url = new URL(buildDatabaseUrl(process.env) || 'postgresql://invalid');
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Nama database tidak valid: ${dbName}`);

  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount) {
    // eslint-disable-next-line no-console
    console.log(`Database "${dbName}" sudah ada.`);
  } else {
    await client.query(`CREATE DATABASE "${dbName}"`);
    // eslint-disable-next-line no-console
    console.log(`Database "${dbName}" dibuat.`);
  }
  await client.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message ?? err);
  process.exit(1);
});
