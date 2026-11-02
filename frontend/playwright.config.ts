import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

/**
 * E2E Modul 2 (M2_TASK_005 §D). Prasyarat: PostgreSQL + Redis + backend berjalan dan seed demo Modul 1 sudah ada.
 * Memakai Chrome yang terpasang (channel 'chrome') sehingga tidak perlu mengunduh browser Playwright.
 * Jalankan: npm run test:e2e
 */
const env = loadEnv('development', '..', '');
process.env.SEED_DEMO_PASSWORD ??= env.SEED_DEMO_PASSWORD || 'Demo12345!';
const port = Number(env.FRONTEND_PORT || 5173);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
