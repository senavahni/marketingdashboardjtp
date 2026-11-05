import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * E2E Modul 3 di stack nyata (M3_TASK_006 §B, E2E-M3-01..07): Dashboard + MCP + LLM Gateway (OpenAI sungguhan).
 * Prasyarat: start-project(...).bat --no-runtime, sumber Web tersedia (profil browser `default` + chromedriver),
 * key Gateway per agent sudah diprovisioning. Tiap job memakai ±$0,01 token OpenAI.
 */
const WS = '00000000-0000-4000-8000-000000000001';
const PASSWORD = process.env.SEED_DEMO_PASSWORD as string;
const RUN = Date.now().toString(36);
const TITLE = `E2E Riset web ${RUN}`;
const URL_UNDER_TEST = 'https://example.com/';
const JOB_TIMEOUT_MS = 150_000;
const AGENT_IDS = { researcher: '00000000-0000-4000-8000-000000000202', analyst: '00000000-0000-4000-8000-000000000204' };
const SENTIMENT_VALUE: Record<string, string> = { Positif: 'positive', Netral: 'neutral', Negatif: 'negative' };

test.describe.configure({ mode: 'serial' });

let page: Page;
let api: APIRequestContext;
const tokens: Record<string, string> = {};
const cleanup: string[] = [];
/** Project milik AI yang dibuat E2E-M3-09 — dihapus di akhir. */
const aiProjects: string[] = [];
const PLAN_TIMEOUT_MS = 240_000;
let jobId = '';

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

const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
/** Header halaman detail job (Card juga memakai <header>, jadi dipilih yang memuat h1). */
const jobHeader = (p: Page) => p.locator('header').filter({ has: p.getByRole('heading', { level: 1 }) });

async function jobStatus(id: string): Promise<{ status: string; retry_of_job_id: string | null }> {
  const res = await api.get(`/api/v1/intel/jobs/${id}`, { headers: auth('member') });
  expect(res.status()).toBe(200);
  return (await res.json()) as { status: string; retry_of_job_id: string | null };
}

/** Tes selain E2E-M3-09 tidak menulis ke Penjadwalan (kartu aktif otomatis bila workspace punya project). */
async function noSchedule(wizard: Locator): Promise<void> {
  const box = wizard.getByRole('checkbox', { name: /Masukkan ke Penjadwalan/ });
  await expect(box).toBeChecked();
  await box.uncheck();
}

/** Job lambat (8 halaman, rate limit per domain) supaya sempat dibatalkan dari UI. */
async function createSlowJob(title: string): Promise<string> {
  const urls = Array.from({ length: 8 }, (_, i) => `${URL_UNDER_TEST}?e2e=${RUN}-${i}`);
  const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const res = await api.post(`/api/v1/workspaces/${WS}/intel/jobs`, {
    headers: auth('member'),
    data: {
      spec: { title, language: 'id', period: { since, until }, sources: [{ type: 'web', mode: 'scrape', urls }], aspects: [] },
      agents: { collect: AGENT_IDS.researcher, analyze: AGENT_IDS.analyst },
      confirm_cost: false,
    },
  });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  cleanup.push(id);
  return id;
}

test.beforeAll(async ({ browser, playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL });
  for (const who of ['owner', 'member', 'viewer']) {
    const res = await api.post('/api/v1/auth/login', { data: { identifier: `${who}@demo.local`, password: PASSWORD } });
    tokens[who] = ((await res.json()) as { access_token: string }).access_token;
  }
  page = await newPageAs(browser, 'member');
});

test.afterAll(async () => {
  for (const id of aiProjects) await api.delete(`/api/v1/projects/${id}`, { headers: auth('owner') });
  for (const id of cleanup) await api.delete(`/api/v1/intel/jobs/${id}`, { headers: auth('member') });
  await api.dispose();
});

test('E2E-M3-01 buat job via wizard dengan agent default → estimasi tampil → job berjalan', async () => {
  await page.goto(`/w/${WS}`);
  await page.getByRole('link', { name: 'Riset & Insight' }).click();
  await expect(page.getByRole('heading', { name: 'Riset & Insight' })).toBeVisible();

  await page.getByRole('button', { name: 'Job Baru' }).click();
  const wizard = page.getByRole('dialog', { name: 'Job riset baru' });
  await wizard.getByLabel('Judul riset').fill(TITLE);
  // X tercentang default; di stack ini hanya Web yang dipakai (deterministik)
  const x = wizard.getByRole('checkbox', { name: /^X / });
  if ((await x.getAttribute('aria-checked')) === 'true') await x.click();
  await wizard.getByRole('checkbox', { name: /^Web / }).click();
  await wizard.getByPlaceholder('https://contoh.id/artikel').fill(URL_UNDER_TEST);
  await wizard.getByPlaceholder('https://contoh.id/artikel').press('Enter');
  await wizard.getByRole('button', { name: 'Lanjut' }).click();

  await wizard.getByRole('button', { name: '7 hari terakhir' }).click();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();

  // Langkah 3 (M3_TASK_008): default per tahap terpilih otomatis
  await expect(wizard.getByRole('radiogroup', { name: 'Kumpulkan data' }).getByRole('radio', { name: /Agent_Researcher/ })).toBeChecked();
  await expect(wizard.getByRole('radiogroup', { name: 'Analisis' }).getByRole('radio', { name: /Agent_Analyst/ })).toBeChecked();
  // agent yang tidak mampu tidak bisa dipilih (diringkas di bawah daftar)
  await expect(wizard.getByRole('radiogroup', { name: 'Analisis' }).getByRole('radio', { name: /Agent_Strategist/ })).toHaveCount(0);
  await noSchedule(wizard);
  await wizard.getByRole('button', { name: 'Lanjut' }).click();

  const run = wizard.getByRole('button', { name: 'Jalankan riset' });
  await expect(run).toBeEnabled({ timeout: 45_000 });
  await expect(wizard).toContainText('$');
  await run.click();

  await page.waitForURL(new RegExp(`/w/${WS}/intel/[0-9a-f-]{36}$`));
  jobId = page.url().split('/').pop() as string;
  cleanup.push(jobId);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
});

test('E2E-M3-02/03 tahap kumpulkan & analisis selesai tanpa refresh; biaya per agent tercatat', async () => {
  test.setTimeout(JOB_TIMEOUT_MS + 30_000);
  // Tidak ada page.reload(): status berubah lewat Socket.IO
  await expect(jobHeader(page).getByText('Selesai', { exact: true })).toBeVisible({ timeout: JOB_TIMEOUT_MS });

  const workedBy = page.locator('section').filter({ has: page.getByText('Dikerjakan oleh', { exact: true }) });
  await expect(workedBy).toContainText('Agent_Researcher');
  await expect(workedBy).toContainText('Agent_Analyst');
  await expect(workedBy).toContainText(/\$0,\d+/);

  const job = (await (await api.get(`/api/v1/intel/jobs/${jobId}`, { headers: auth('member') })).json()) as {
    cost: { by_stage: { stage: string; agent_key: string; llm_tokens: number }[] };
  };
  expect(job.cost.by_stage).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'analyze', agent_key: 'analyst' })]));
  expect(job.cost.by_stage.find((s) => s.stage === 'analyze')!.llm_tokens).toBeGreaterThan(0);
});

test('E2E-M3-04 data mentah: filter sentimen + ekspor CSV sesuai filter', async () => {
  await page.getByRole('tab', { name: 'Data mentah' }).click();
  const table = page.getByRole('table');
  const firstRow = table.getByRole('row').first();
  await expect(firstRow).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/1 dari 1 baris dimuat/)).toBeVisible();

  const label = (await firstRow.locator('span.rounded-full').innerText()).trim();
  const value = SENTIMENT_VALUE[label];
  expect(value).toBeDefined();
  const filters = page.getByRole('group', { name: 'Filter sentimen' });

  // Sentimen lain → tabel kosong
  const other = Object.keys(SENTIMENT_VALUE).find((l) => l !== label)!;
  await filters.getByRole('button', { name: other }).click();
  await expect(page.getByText('Tidak ada data yang cocok.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekspor CSV' })).toBeDisabled();
  await filters.getByRole('button', { name: other }).click();

  // Sentimen item → CSV hanya berisi item tsb
  await filters.getByRole('button', { name: label }).click();
  await expect(filters.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/1 dari 1 baris dimuat/)).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Ekspor CSV' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^riset_.*\.csv$/);
  const csv = await readFile((await file.path())!, 'utf8');
  expect(csv).toContain('example.com');
  expect(csv).toContain(`"${value}"`);
  for (const v of Object.values(SENTIMENT_VALUE).filter((x) => x !== value)) expect(csv).not.toContain(`"${v}"`);
});

test('E2E-M3-05 batalkan job berjalan lalu ulangi → job baru dengan retry_of_job_id', async () => {
  test.setTimeout(JOB_TIMEOUT_MS);
  const slowTitle = `E2E Batal ${RUN}`;
  const slowId = await createSlowJob(slowTitle);
  await page.goto(`/w/${WS}/intel/${slowId}`);
  await page.getByRole('button', { name: 'Batalkan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Batalkan job?' });
  await expect(dialog).toContainText(slowTitle);
  await dialog.getByRole('button', { name: 'Batalkan job' }).click();
  await expect(jobHeader(page).getByText('Dibatalkan', { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Ulangi' }).click();
  const wizard = page.getByRole('dialog', { name: 'Ulangi job riset' });
  await expect(wizard.getByLabel('Judul riset')).toHaveValue(slowTitle);
  await wizard.getByRole('button', { name: /Estimasi/ }).click();
  const run = wizard.getByRole('button', { name: 'Jalankan riset' });
  await expect(run).toBeEnabled({ timeout: 45_000 });
  await run.click();

  await page.waitForURL((u) => /\/intel\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(slowId));
  const retryId = page.url().split('/').pop() as string;
  cleanup.push(retryId);
  expect((await jobStatus(retryId)).retry_of_job_id).toBe(slowId);
  expect((await jobStatus(slowId)).status).toBe('cancelled');
  // Hemat biaya: hentikan job ulangan
  await api.post(`/api/v1/intel/jobs/${retryId}/cancel`, { headers: auth('member') });
});

test('E2E-M3-08 simpan ke Knowledge Base: toggle wizard → tahap Indeks → badge chunk (M3_TASK_010)', async () => {
  test.setTimeout(JOB_TIMEOUT_MS + 30_000);
  const kbTitle = `E2E KB ${RUN}`;
  await page.goto(`/w/${WS}/intel`);
  await page.getByRole('button', { name: 'Job Baru' }).click();
  const wizard = page.getByRole('dialog', { name: 'Job riset baru' });
  await wizard.getByLabel('Judul riset').fill(kbTitle);
  const x = wizard.getByRole('checkbox', { name: /^X / });
  if ((await x.getAttribute('aria-checked')) === 'true') await x.click();
  await wizard.getByRole('checkbox', { name: /^Web / }).click();
  await wizard.getByPlaceholder('https://contoh.id/artikel').fill(URL_UNDER_TEST);
  await wizard.getByPlaceholder('https://contoh.id/artikel').press('Enter');
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: '7 hari terakhir' }).click();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();

  const indexGroup = wizard.getByRole('radiogroup', { name: 'Indeks ke Knowledge Base' });
  await expect(indexGroup).toHaveCount(0);
  await wizard.getByRole('checkbox', { name: /Simpan ke Knowledge Base/ }).check();
  await expect(indexGroup.getByRole('radio', { name: /Agent_Researcher/ })).toBeEnabled();
  await indexGroup.getByText('Agent_Strategist').click();
  await expect(indexGroup.getByRole('radio', { name: /Agent_Strategist/ })).toBeChecked();
  await noSchedule(wizard);
  await wizard.getByRole('button', { name: 'Lanjut' }).click();

  await expect(wizard.getByText('Indeks', { exact: true })).toBeVisible({ timeout: 45_000 });
  const run = wizard.getByRole('button', { name: 'Jalankan riset' });
  await expect(run).toBeEnabled({ timeout: 45_000 });
  await run.click();
  await page.waitForURL(new RegExp(`/w/${WS}/intel/[0-9a-f-]{36}$`));
  const kbJob = page.url().split('/').pop() as string;
  cleanup.push(kbJob);

  await expect(jobHeader(page).getByText('Selesai', { exact: true })).toBeVisible({ timeout: JOB_TIMEOUT_MS });
  await expect(jobHeader(page).getByText(/Tersimpan di KB \(\d+ chunk\)/)).toBeVisible();
  const view = (await (await api.get(`/api/v1/intel/jobs/${kbJob}`, { headers: auth('member') })).json()) as {
    stages: { stage: string; agent_key: string; status: string }[];
    cost: { by_stage: { stage: string; agent_key: string }[] };
  };
  expect(view.stages.find((s) => s.stage === 'index')).toMatchObject({ agent_key: 'strategist', status: 'completed' });
  expect(view.cost.by_stage).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'index', agent_key: 'strategist' })]));

  // M3_TASK_011: proyeksi PCA dari KB (viewer boleh) + panel 3D dengan fallback 2D
  const projection = await api.get(`/api/v1/intel/jobs/${kbJob}/projection`, { headers: auth('viewer') });
  expect(projection.status()).toBe(200);
  const { points, method } = (await projection.json()) as { points: { source: string; label: string }[]; method: string };
  expect(method).toBe('pca');
  expect(points.length).toBeGreaterThan(0);
  expect(points.every((p) => p.source === 'web' && p.label.length <= 60)).toBe(true);

  await page.getByRole('button', { name: 'Tampilan 3D' }).click();
  await expect(page.getByRole('button', { name: 'Tampilan 2D' })).toBeVisible();
  const scene = page.getByRole('img', { name: /Visualisasi 3D aliran data riset/ });
  const fallback = page.getByText('Tampilan 3D dinonaktifkan.', { exact: false });
  await expect(scene.or(fallback)).toBeVisible({ timeout: 20_000 });
});

test('E2E-M3-09 masukkan ke Penjadwalan: subtask tahap ikut job → agent menulis rencana (mode auto, M3_TASK_013)', async () => {
  test.setTimeout(JOB_TIMEOUT_MS + PLAN_TIMEOUT_MS);
  await page.goto(`/w/${WS}/intel`);
  await page.getByRole('button', { name: 'Job Baru' }).click();
  const wizard = page.getByRole('dialog', { name: 'Job riset baru' });
  await wizard.getByLabel('Judul riset').fill(`E2E Jadwal ${RUN}`);
  const x = wizard.getByRole('checkbox', { name: /^X / });
  if ((await x.getAttribute('aria-checked')) === 'true') await x.click();
  await wizard.getByRole('checkbox', { name: /^Web / }).click();
  await wizard.getByPlaceholder('https://contoh.id/artikel').fill(URL_UNDER_TEST);
  await wizard.getByPlaceholder('https://contoh.id/artikel').press('Enter');
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: '7 hari terakhir' }).click();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();

  // default: aktif, project baru milik AI, mode "Langsung jalan"
  await expect(wizard.getByRole('checkbox', { name: /Masukkan ke Penjadwalan/ })).toBeChecked();
  await expect(wizard.getByRole('combobox', { name: /Project/ })).toHaveValue('new');
  await expect(wizard.getByRole('radiogroup', { name: 'Mode rencana' }).getByRole('radio', { name: /Langsung jalan/ })).toBeChecked();
  // eksekusi agent (Fase B) diuji terpisah: di sini matikan agar suite tidak memicu run agent berbayar
  await wizard.getByRole('checkbox', { name: /Agent mengerjakan task bagiannya/ }).uncheck();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  const run = wizard.getByRole('button', { name: 'Jalankan riset' });
  await expect(run).toBeEnabled({ timeout: 45_000 });
  await run.click();
  await page.waitForURL(new RegExp(`/w/${WS}/intel/[0-9a-f-]{36}$`));
  const id = page.url().split('/').pop() as string;
  cleanup.push(id);

  const card = page.locator('section').filter({ has: page.getByText('Jadwal', { exact: true }) });
  await expect(card).toBeVisible();
  await expect(jobHeader(page).getByText('Selesai', { exact: true })).toBeVisible({ timeout: JOB_TIMEOUT_MS });
  await expect(card.getByText('Terjadwal di Penjadwalan')).toBeVisible({ timeout: PLAN_TIMEOUT_MS });
  await expect(card).toContainText(/\d+ task \+ \d+ subtask/);

  const mission = (await (await api.get(`/api/v1/intel/jobs/${id}/mission`, { headers: auth('member') })).json()) as {
    data: { root_task_id: string; project_id: string; status: string };
  };
  aiProjects.push(mission.data.project_id);
  const aiProject = (await (await api.get(`/api/v1/projects/${mission.data.project_id}`, { headers: auth('member') })).json()) as {
    title: string;
    icon: string | null;
  };
  expect(aiProject).toMatchObject({ title: `Riset: E2E Jadwal ${RUN}`, icon: '🤖' });
  const root = (await (await api.get(`/api/v1/tasks/${mission.data.root_task_id}`, { headers: auth('member') })).json()) as {
    tags: string[];
    subtasks: { title: string; status: string; tags: string[] }[];
  };
  expect(root.tags).toContain('misi');
  const stages = root.subtasks.filter((s) => s.tags.some((t) => t.startsWith('tahap:')));
  expect(stages.map((s) => s.status)).toEqual(['done', 'done']);
  expect(root.subtasks.length).toBeGreaterThan(stages.length); // + task rencana agent

  await card.getByRole('link', { name: /Buka di Penjadwalan/ }).click();
  await page.waitForURL(new RegExp(`/w/${WS}/p/${mission.data.project_id}`));
});

test('E2E-M3-10 Perintah ke Agent: form → rencana (tinjau dulu) → setujui → task di project AI (M3_TASK_014 Fase A)', async () => {
  test.setTimeout(PLAN_TIMEOUT_MS + 60_000);
  await page.goto(`/w/${WS}/intel`);
  await page.getByRole('link', { name: 'Misi Agent' }).click();
  await expect(page.getByRole('heading', { name: 'Misi Agent' })).toBeVisible();
  await page.getByRole('button', { name: 'Perintah ke Agent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Perintah ke Agent' });
  await dialog.getByRole('button', { name: 'Kirim perintah' }).click();
  await expect(dialog.getByText('Judul wajib diisi')).toBeVisible(); // validasi klien

  const title = `E2E Misi ${RUN}`;
  await dialog.getByLabel('Judul misi').fill(title);
  await dialog.getByLabel('Perintah').fill('Siapkan 3 konten edukasi kopi susu untuk Instagram, termasuk riset singkat dan jadwal unggah.');
  await expect(dialog.getByRole('combobox', { name: /Project/ })).toHaveValue('new');
  await dialog.getByText('Tinjau dulu', { exact: true }).click();
  await dialog.getByRole('checkbox', { name: /Agent mengerjakan task bagiannya/ }).uncheck(); // tanpa run agent berbayar
  await dialog.getByRole('button', { name: 'Kirim perintah' }).click();

  await page.waitForURL(new RegExp(`/w/${WS}/intel/missions/[0-9a-f-]{36}$`));
  const missionId = page.url().split('/').pop() as string;
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const plan = page.getByRole('list', { name: 'Rencana task' });
  await expect(plan).toBeVisible({ timeout: PLAN_TIMEOUT_MS });
  const mission = (await (await api.get(`/api/v1/missions/${missionId}`, { headers: auth('member') })).json()) as {
    project_id: string;
    root_task_id: string;
    status: string;
    source: string;
  };
  aiProjects.push(mission.project_id);
  expect(mission).toMatchObject({ status: 'awaiting_review', source: 'manual' });
  const before = (await (await api.get(`/api/v1/tasks/${mission.root_task_id}`, { headers: auth('member') })).json()) as { subtasks: unknown[] };
  expect(before.subtasks).toHaveLength(0); // belum ada task sebelum disetujui

  await page.getByRole('button', { name: 'Setujui' }).click();
  await expect(page.getByText('Terjadwal di Penjadwalan')).toBeVisible({ timeout: 30_000 });
  const after = (await (await api.get(`/api/v1/tasks/${mission.root_task_id}`, { headers: auth('member') })).json()) as { subtasks: unknown[] };
  expect(after.subtasks.length).toBeGreaterThan(0);
});

test('E2E-M3-06 AI & Gateway: admin melihat key per agent; member tidak punya akses', async ({ browser }) => {
  const owner = await newPageAs(browser, 'owner');
  await owner.goto(`/w/${WS}`);
  await owner.getByRole('button', { name: 'Pengaturan' }).click();
  const settings = owner.getByRole('dialog', { name: 'Pengaturan workspace' });
  await settings.getByRole('button', { name: 'AI & Gateway' }).click();
  await expect(settings.getByText('Default agent per tahap')).toBeVisible();
  const row = settings.getByRole('row').filter({ hasText: 'Agent_Analyst' });
  await expect(row).toContainText(/lgw_[a-z0-9]{8}…/);
  await expect(row).toContainText(/Key (agent|system|env)/);
  expect(await settings.innerText()).not.toMatch(/lgw_[a-z0-9]{8}_[A-Za-z0-9_-]{20,}/);
  await owner.context().close();

  await page.goto(`/w/${WS}`);
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  const memberSettings = page.getByRole('dialog', { name: 'Pengaturan workspace' });
  await expect(memberSettings.getByRole('button', { name: 'AI Agents' })).toBeVisible();
  await expect(memberSettings.getByRole('button', { name: 'AI & Gateway' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const res = await api.get(`/api/v1/workspaces/${WS}/intel/llm-status`, { headers: auth('member') });
  expect(res.status()).toBe(403);
});

test('E2E-M3-07 viewer bisa melihat & ekspor, tidak bisa membuat/membatalkan/menghapus', async ({ browser }) => {
  const viewer = await newPageAs(browser, 'viewer');
  await viewer.goto(`/w/${WS}/intel`);
  await expect(viewer.getByRole('button', { name: TITLE })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Job Baru' })).toHaveCount(0);

  await viewer.goto(`/w/${WS}/intel/${jobId}`);
  await expect(viewer.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Ekspor' })).toBeEnabled();
  await expect(viewer.getByRole('button', { name: 'Batalkan' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Ulangi' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Hapus job' })).toHaveCount(0);

  const res = await api.post(`/api/v1/intel/jobs/${jobId}/cancel`, { headers: auth('viewer') });
  expect(res.status()).toBe(403);
  await viewer.context().close();
});
