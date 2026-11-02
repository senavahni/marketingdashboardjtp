/**
 * Integration test API Laporan Website (M2_TASK_005 §B) terhadap backend yang sedang berjalan + seed demo Modul 1.
 * Jalankan: `npm run test:api` (default http://localhost:3000, ubah dengan API_BASE_URL).
 */
import { SEED_IDS } from '../../src/database/seeds/seed-ids';

const BASE = `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/v1`;
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo12345!';
const WS = SEED_IDS.wsDemo;

type Role = 'owner' | 'manager' | 'member' | 'viewer' | 'outsider';
const tokens = {} as Record<Role, string>;

interface ApiResult {
  status: number;
  body: any;
}

async function api(role: Role, method: string, path: string, body?: unknown): Promise<ApiResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const gt1 = {
  title: 'IT — Website Oktober 2026',
  period_type: 'monthly',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  visitors: 20000,
  leads: 800,
  sales_count: 200,
  revenue: '150000000',
  cost_maintenance: '10000000',
  cost_ads: '5000000',
};

const created: string[] = [];
const create = async (role: Role, patch: Record<string, unknown> = {}) => {
  const res = await api(role, 'POST', `/workspaces/${WS}/web-reports`, { ...gt1, ...patch });
  if (res.status === 201) created.push(res.body.id);
  return res;
};

beforeAll(async () => {
  for (const role of ['owner', 'manager', 'member', 'viewer', 'outsider'] as Role[]) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: `${role}@demo.local`, password: PASSWORD }),
    });
    const body = (await res.json()) as { access_token: string };
    if (!res.ok) throw new Error(`Login ${role} gagal: ${JSON.stringify(body)}`);
    tokens[role] = body.access_token;
  }
});

afterAll(async () => {
  // Bersihkan data test (soft delete) agar tidak mengotori daftar demo
  for (const id of created) await api('owner', 'DELETE', `/web-reports/${id}`);
});

describe('Web Reports API', () => {
  it('create → 201, hasil sesuai golden test GT-1', async () => {
    const res = await create('member');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      period_type: 'monthly',
      input: { visitors: 20000, revenue: '150000000.00', cost_ads: '5000000.00' },
      results: { lead_cr: 4, sales_cr: 1, lead_to_sales_cr: 25, aov: '750000.00', rpv: '7500.00', roas: 10, roi: 900 },
      formula_version: 1,
      version: 1,
      created_by: { type: 'user', name: 'Member Demo' },
    });
    expect(res.body.results.insights.map((i: { code: string }) => i.code)).toEqual(['COST_COVERED', 'RPV_ABOVE_CPV']);
  });

  it('validasi: 400 VALIDATION_ERROR, 422 FUNNEL_INCONSISTENT / INVALID_DATE_RANGE / INVALID_PERIOD', async () => {
    expect((await create('member', { visitors: -1 })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await create('member', { leads: 1.5 })).status).toBe(400);
    const funnel = await create('member', { sales_count: 900 });
    expect(funnel.status).toBe(422);
    expect(funnel.body.error).toMatchObject({ code: 'FUNNEL_INCONSISTENT', details: { field: 'sales_count' } });
    expect((await create('member', { period_type: 'custom', period_end: '2026-09-01' })).body.error.code).toBe('INVALID_DATE_RANGE');
    expect((await create('member', { period_end: '2026-11-30' })).body.error.code).toBe('INVALID_PERIOD');
  });

  it('RBAC: viewer baca saja, member non-pembuat 403, outsider 404', async () => {
    const { body: session } = await create('member');
    expect((await api('viewer', 'GET', `/web-reports/${session.id}`)).status).toBe(200);
    expect((await create('viewer')).status).toBe(403);
    expect((await api('viewer', 'PATCH', `/web-reports/${session.id}`, { version: 1, title: 'x' })).status).toBe(403);
    expect((await api('viewer', 'DELETE', `/web-reports/${session.id}`)).status).toBe(403);

    const { body: ownerSession } = await create('owner');
    expect((await api('member', 'PATCH', `/web-reports/${ownerSession.id}`, { version: 1, title: 'x' })).status).toBe(403);
    expect((await api('member', 'DELETE', `/web-reports/${ownerSession.id}`)).status).toBe(403);
    expect((await api('manager', 'PATCH', `/web-reports/${session.id}`, { version: 1, notes: 'dicek admin' })).status).toBe(200);

    expect((await api('outsider', 'GET', `/web-reports/${session.id}`)).status).toBe(404);
    expect((await api('outsider', 'GET', `/workspaces/${WS}/web-reports`)).status).toBe(404);
  });

  it('update menghitung ulang; versi lama → 409 VERSION_CONFLICT', async () => {
    const { body: session } = await create('member');
    const updated = await api('member', 'PATCH', `/web-reports/${session.id}`, { version: 1, revenue: '165000000' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ version: 2, results: { roas: 11 } });
    const stale = await api('member', 'PATCH', `/web-reports/${session.id}`, { version: 1, title: 'basi' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect((await api('member', 'GET', `/web-reports/${session.id}`)).body.title).toBe(gt1.title);
  });

  it('list: urut periode terbaru, filter tahun, item tanpa insights', async () => {
    await create('member', { title: 'IT — Tahunan 2025', period_type: 'yearly', period_start: '2025-01-01', period_end: '2025-12-31' });
    const all = await api('viewer', 'GET', `/workspaces/${WS}/web-reports?limit=200`);
    expect(all.status).toBe(200);
    const starts = all.body.data.map((s: { period_start: string }) => s.period_start);
    expect([...starts].sort().reverse()).toEqual(starts);
    expect(all.body.data[0].results.insights).toBeUndefined();
    const only2025 = await api('viewer', 'GET', `/workspaces/${WS}/web-reports?year=2025&period_type=yearly`);
    expect(only2025.body.data.every((s: { period_start: string }) => s.period_start.startsWith('2025'))).toBe(true);
    expect(only2025.body.data.length).toBeGreaterThan(0);
  });

  it('compare: urut period_start asc; jumlah id di luar 2–12 → 400; id workspace lain → 404', async () => {
    const { body: feb } = await create('member', { title: 'IT — Feb', period_start: '2026-02-01', period_end: '2026-02-28' });
    const { body: jan } = await create('member', { title: 'IT — Jan', period_start: '2026-01-01', period_end: '2026-01-31' });
    const res = await api('viewer', 'GET', `/workspaces/${WS}/web-reports/compare?ids=${feb.id},${jan.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { id: string }) => s.id)).toEqual([jan.id, feb.id]);
    expect((await api('viewer', 'GET', `/workspaces/${WS}/web-reports/compare?ids=${jan.id}`)).status).toBe(400);
    const outsiderWs = await api('outsider', 'GET', `/workspaces/${SEED_IDS.wsOutsider}/web-reports/compare?ids=${jan.id},${feb.id}`);
    expect(outsiderWs.status).toBe(404);
  });

  it('soft delete: GET 404 & hilang dari list', async () => {
    const { body: session } = await create('member');
    expect((await api('member', 'DELETE', `/web-reports/${session.id}`)).status).toBe(204);
    expect((await api('member', 'GET', `/web-reports/${session.id}`)).status).toBe(404);
    const list = await api('member', 'GET', `/workspaces/${WS}/web-reports?limit=200`);
    expect(list.body.data.some((s: { id: string }) => s.id === session.id)).toBe(false);
  });
});
