import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/** E2E Modul 2 — skenario E2E-M2-01..06 (M2_TASK_005 §D). Data seed demo Modul 1. */
const WS = '00000000-0000-4000-8000-000000000001';
const PASSWORD = process.env.SEED_DEMO_PASSWORD as string;
const RUN = Date.now().toString(36);
const TITLE = `E2E Website Oktober ${RUN}`;

test.describe.configure({ mode: 'serial' });

let page: Page;
let api: APIRequestContext;
let token = '';
let sessionId = '';
const cleanup: string[] = [];

async function login(p: Page, who: string): Promise<void> {
  await p.goto('/login');
  await p.getByLabel('Email atau username').fill(`${who}@demo.local`);
  await p.getByLabel('Password').fill(PASSWORD);
  await p.getByRole('button', { name: /masuk/i }).click();
  await p.waitForURL(/\/w\//);
}

async function newPageAs(browser: Browser, who: string): Promise<Page> {
  const p = await (await browser.newContext()).newPage();
  await login(p, who);
  return p;
}

async function createViaApi(body: Record<string, unknown>): Promise<string> {
  const res = await api.post(`/api/v1/workspaces/${WS}/web-reports`, { headers: { Authorization: `Bearer ${token}` }, data: body });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  cleanup.push(id);
  return id;
}

test.beforeAll(async ({ browser, playwright, baseURL }) => {
  page = await newPageAs(browser, 'member');
  api = await playwright.request.newContext({ baseURL });
  const res = await api.post('/api/v1/auth/login', { data: { identifier: 'member@demo.local', password: PASSWORD } });
  token = ((await res.json()) as { access_token: string }).access_token;
});

test.afterAll(async () => {
  for (const id of cleanup) await api.delete(`/api/v1/web-reports/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  await api.dispose();
});

const result = () => page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /Ekspor/ }) });

test('E2E-M2-01 buat laporan dari input manual → modal hasil (GT-1)', async () => {
  await page.goto(`/w/${WS}`);
  await page.getByRole('link', { name: 'Laporan Website' }).click();
  await expect(page.getByRole('heading', { name: 'Laporan Performa Website' })).toBeVisible();

  await page.getByRole('button', { name: 'Laporan Baru' }).first().click();
  const form = page.getByRole('dialog', { name: 'Laporan website baru' });
  await form.getByRole('radio', { name: 'Bulanan' }).click();
  await form.getByLabel('Bulan').selectOption('10');
  await form.getByLabel('Tahun').selectOption('2026');
  await expect(form.getByLabel('Judul laporan')).toHaveValue('Website — Oktober 2026');
  await form.getByLabel('Judul laporan').fill(TITLE);
  await form.getByLabel('Total pengunjung').fill('20000');
  await expect(form.getByLabel('Total pengunjung')).toHaveValue('20.000');

  // Validasi client: sales > leads ditolak
  await form.getByLabel('Order masuk (leads)').fill('800');
  await form.getByLabel('Sales (closing/lunas)').fill('900');
  await form.getByLabel('Total omset').fill('150000000');
  await form.getByRole('button', { name: 'Hitung & Simpan' }).click();
  await expect(form.getByText('Sales tidak boleh melebihi jumlah leads')).toBeVisible();

  await form.getByLabel('Sales (closing/lunas)').fill('200');
  await form.getByLabel('Biaya maintenance').fill('10000000');
  await form.getByLabel('Biaya iklan').fill('5000000');
  await expect(form.getByText('Rp15.000.000')).toBeVisible();
  await form.getByRole('button', { name: 'Hitung & Simpan' }).click();

  const modal = result();
  await expect(modal.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(modal).toContainText('10,00x');
  await expect(modal).toContainText('ROI 900,00%');
  await expect(modal).toContainText('Rp750.000');
  await expect(modal).toContainText('Rp7.500');
  await expect(modal).toContainText('4,00%');
  await expect(modal).toContainText('25,00%');
  await expect(modal).toContainText('Omset 10,00x lipat biaya website');
  sessionId = new URL(page.url()).searchParams.get('session') ?? '';
  expect(sessionId).not.toBe('');
  cleanup.push(sessionId);
});

test('E2E-M2-02 ubah omset → dihitung ulang & bertahan setelah reload', async () => {
  await result().getByRole('button', { name: 'Ubah' }).click();
  const form = page.getByRole('dialog', { name: 'Ubah laporan' });
  await expect(form.getByLabel('Total omset')).toHaveValue('150.000.000');
  await form.getByLabel('Total omset').fill('165000000');
  await form.getByRole('button', { name: 'Hitung & Simpan' }).click();
  await expect(form).toBeHidden();
  await expect(result()).toContainText('11,00x');

  await page.reload();
  await expect(result()).toContainText('11,00x');
});

test('E2E-M2-03 ekspor PDF, XLSX, CSV, PPTX dengan angka yang sama', async () => {
  const download = async (label: RegExp) => {
    await result().getByRole('button', { name: /Ekspor/ }).click();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
    return file;
  };
  const slug = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const pdf = await download(/^PDF/);
  expect(pdf.suggestedFilename()).toBe(`laporan-website_${slug}_2026-10.pdf`);
  expect((await readFile((await pdf.path())!)).subarray(0, 4).toString()).toBe('%PDF');

  const csv = await download(/^CSV/);
  const csvText = await readFile((await csv.path())!, 'utf8');
  expect(csvText).toContain('hasil,ROAS,roas,11,x');
  expect(csvText).toContain('hasil,Lead CR (Website → Lead),lead_cr,4,%');
  expect(csvText).toContain('input,Total omset,revenue,165000000.00,IDR');

  const xlsx = await download(/^Excel/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await readFile((await xlsx.path())!));
  const sheet = wb.getWorksheet('Ringkasan')!;
  expect(sheet.getCell('B9').value).toBe(165000000);
  expect((sheet.getCell('B17').value as ExcelJS.CellFormulaValue).result).toBe(11);

  const pptx = await download(/^PowerPoint/);
  expect(pptx.suggestedFilename()).toMatch(/\.pptx$/);
  expect((await readFile((await pptx.path())!)).subarray(0, 2).toString()).toBe('PK');
});

test('E2E-M2-05 bandingkan Januari vs Februari (P1)', async () => {
  const base = { period_type: 'monthly', visitors: 10000, leads: 300, cost_maintenance: '5000000', cost_ads: '0' };
  await createViaApi({ ...base, title: `E2E Jan ${RUN}`, period_start: '2026-01-01', period_end: '2026-01-31', sales_count: 100, revenue: '50000000' });
  await createViaApi({ ...base, title: `E2E Feb ${RUN}`, period_start: '2026-02-01', period_end: '2026-02-28', sales_count: 50, revenue: '75000000' });

  await page.goto(`/w/${WS}/web-report`);
  await page.getByLabel(`Pilih E2E Jan ${RUN} untuk dibandingkan`).check();
  await page.getByLabel(`Pilih E2E Feb ${RUN} untuk dibandingkan`).check();
  await page.getByRole('button', { name: 'Bandingkan (2)' }).click();

  const modal = page.getByRole('dialog', { name: 'Perbandingan laporan' });
  await expect(modal.getByText('Laporan finansial · Omset & RPV')).toBeVisible();
  const best = (metric: string) => modal.locator('tr', { has: page.getByRole('rowheader', { name: metric, exact: true }) }).locator('td:has([aria-label="tertinggi"])');
  await expect(best('Sales CR')).toContainText('1,00%');
  await expect(best('RPV')).toContainText('Rp7.500');
  await page.keyboard.press('Escape');
});

test('E2E-M2-04 hapus laporan → hilang & link lama tidak ditemukan', async () => {
  await page.goto(`/w/${WS}/web-report?session=${sessionId}`);
  page.once('dialog', (d) => void d.accept());
  await result().getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText('Laporan dihapus')).toBeVisible();
  await expect(page.getByRole('button', { name: TITLE })).toHaveCount(0);

  await page.goto(`/w/${WS}/web-report?session=${sessionId}`);
  await expect(page.getByText('Laporan tidak ditemukan')).toBeVisible();
});

test('E2E-M2-06 viewer hanya bisa melihat & ekspor', async ({ browser }) => {
  const viewer = await newPageAs(browser, 'viewer');
  await viewer.goto(`/w/${WS}/web-report?session=${cleanup[1]}`);
  const modal = viewer.getByRole('dialog').filter({ has: viewer.getByRole('button', { name: /Ekspor/ }) });
  await expect(modal).toContainText('10,00x');
  await expect(modal.getByRole('button', { name: 'Ubah' })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Hapus' })).toHaveCount(0);
  await viewer.keyboard.press('Escape');
  await expect(viewer.getByRole('button', { name: 'Laporan Baru' })).toHaveCount(0);
  await viewer.context().close();
});
