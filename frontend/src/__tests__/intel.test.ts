import { describe, expect, it } from 'vitest';
import { buildIntelReportModel } from '../lib/intel-export/report-model';
import {
  applyJobUpdate,
  applyMcpProfile,
  buildInsightView,
  canCancel,
  canRetry,
  flowEventFromJob,
  formatNet,
  formatUsd,
  kbChunks,
  mcpProfileHint,
  missionTaskHref,
  planCounts,
} from '../lib/intel-format';
import { capableFor, type Insight, type IntelAgent, type IntelJob } from '../lib/intel-types';
import {
  agentOption,
  defaultAgentId,
  draftFromJob,
  draftToInput,
  draftToSchedule,
  emptyDraft,
  firstInvalidStep,
  urlError,
  validateStep,
  type WizardDraft,
} from '../lib/intel-wizard';
import { emptyMissionForm, missionFormToBody, validateMissionForm } from '../lib/intel-mission';
import { parseInline, parseMarkdown, safeHref } from '../lib/safe-markdown';

const agent = (name: string, capabilities: IntelAgent['capabilities'], extra: Partial<IntelAgent> = {}): IntelAgent => ({
  id: name,
  name,
  mcp_agent_key: name,
  capabilities,
  ...extra,
});

const AGENTS = [
  agent('researcher', ['collect', 'analyze', 'index'], { toolsets: ['social', 'web', 'trends', 'kb', 'analysis'] }),
  agent('analyst', ['analyze', 'index'], { toolsets: ['analysis', 'kb'] }),
  agent('strategist', ['index'], { toolsets: ['kb'] }),
  agent('social_only', ['collect'], { toolsets: ['social'] }),
  agent('ghost', [], { reason: 'UNKNOWN_AGENT' }),
  agent('off', ['collect', 'analyze'], { reason: 'AGENT_INACTIVE' }),
];

const TODAY = new Date('2026-11-04T10:00:00');

function validDraft(): WizardDraft {
  const d = emptyDraft(TODAY);
  return { ...d, title: 'Kopi susu Q4', x: { ...d.x, keywords: ['kopi susu'] }, agents: { collect: 'researcher', analyze: 'analyst' } };
}

const INSIGHT: Insight = {
  summary_md: '## Ringkasan\n- Sentimen dominan **positif** (60%).',
  recommendations: ['Perbanyak konten studi kasus.'],
  sentiment: {
    distribution: { positive: 0.6, neutral: 0.3, negative: 0.1 },
    net_sentiment: 0.5,
    by_day: { cols: ['day', 'total', 'positive', 'neutral', 'negative', 'net'], rows: [['2026-10-01', 20, 12, 6, 2, 0.5]] },
    aspects: { cols: ['aspect', 'mentions', 'positive', 'neutral', 'negative', 'net'], rows: [['harga', 40, 10, 10, 20, -0.25]] },
    examples: { positive: [], negative: [] },
  },
  trends: { topics: [{ label: 'otomasi konten', count: 84, share: 0.17 }], hashtags: [['ai', 120]], authors: [['akun_a', 14]] },
  volume_by_day: { cols: ['day', 'source', 'count'], rows: [['2026-10-01', 'x', 20]] },
  google_trends: null,
  partial: false,
  warnings: [],
  generated_at: '2026-11-04T01:00:00Z',
};

function job(overrides: Partial<IntelJob> = {}): IntelJob {
  return {
    id: 'job-1',
    workspace_id: 'ws',
    title: 'X · AI marketing',
    status: 'analyzing',
    spec: {
      title: 'X · AI marketing',
      language: 'id',
      period: { since: '2026-10-01', until: '2026-10-30' },
      sources: [
        { type: 'x', keywords: ['AI marketing'], max_items: 800, match: 'all' },
        { type: 'web', mode: 'scrape', urls: ['https://contoh.id/a'] },
      ],
      stages: { collect: { agent_key: 'researcher' }, analyze: { agent_key: 'analyst', aspects: ['harga'] } },
    },
    sources: ['x', 'web'],
    estimate: {
      seconds: 300,
      sources: [{ type: 'x', mode: 'browser', external_units: 500, usd_external: 0.01 }],
      llm: { tokens_est: 40000, usd_est: 0.1, by_stage: [] },
      requires_confirmation: false,
      warnings: [],
    },
    mcp_job_id: 'j_k3m9x2qa1b',
    total_items: 500,
    items_expire_at: null,
    cost: {
      llm_tokens: 38211,
      usd_llm: 0.094,
      external_units: 500,
      usd_external: 0,
      by_stage: [{ stage: 'analyze', agent_key: 'analyst', llm_tokens: 38211, usd_llm: 0.094 }],
    },
    error: null,
    retry_of_job_id: null,
    created_by: 'u1',
    stages: [
      {
        stage: 'collect',
        agent_id: 'id-researcher',
        agent_key: 'researcher',
        status: 'completed',
        progress_done: 500,
        progress_total: 500,
        error: null,
        started_at: null,
        finished_at: null,
      },
      {
        stage: 'analyze',
        agent_id: 'id-analyst',
        agent_key: 'analyst',
        status: 'running',
        progress_done: 120,
        progress_total: 500,
        error: null,
        started_at: null,
        finished_at: null,
      },
    ],
    insight: INSIGHT,
    created_at: '2026-11-04T01:00:00Z',
    started_at: null,
    finished_at: null,
    insight_pending: false,
    ...overrides,
  };
}

describe('pemilihan agent (M3_TASK_008)', () => {
  it('Strategist tidak bisa dipilih untuk Kumpulkan maupun Analisis', () => {
    expect(capableFor(AGENTS, 'collect').map((a) => a.name)).toEqual(['researcher', 'social_only']);
    expect(capableFor(AGENTS, 'analyze').map((a) => a.name)).toEqual(['researcher', 'analyst']);
    expect(agentOption(AGENTS[2], 'collect', ['x'])).toEqual({ disabled: true, reason: 'Tidak punya kapabilitas Kumpulkan' });
  });

  it('agent collect tanpa toolset web dinonaktifkan untuk sumber web, dengan alasan', () => {
    const socialOnly = AGENTS[3];
    expect(agentOption(socialOnly, 'collect', ['x', 'threads']).disabled).toBe(false);
    expect(agentOption(socialOnly, 'collect', ['x', 'web'])).toEqual({ disabled: true, reason: 'Tidak mendukung sumber Web' });
    expect(agentOption(AGENTS[4], 'analyze', []).reason).toBe('Tidak dikenal oleh MCP');
    expect(agentOption(AGENTS[5], 'analyze', []).reason).toBe('Nonaktif di MCP');
  });

  it('default dari stage-defaults bila masih mampu, selain itu agent mampu pertama (urut nama)', () => {
    expect(defaultAgentId(AGENTS, 'analyze', ['x'], { analyze: { id: 'analyst', name: 'analyst', mcp_agent_key: 'analyst' } })).toBe(
      'analyst',
    );
    expect(
      defaultAgentId(AGENTS, 'analyze', ['x'], { analyze: { id: 'strategist', name: 'strategist', mcp_agent_key: 'strategist' } }),
    ).toBe('analyst');
    expect(defaultAgentId(AGENTS, 'collect', ['web'])).toBe('researcher');
    expect(defaultAgentId([AGENTS[2]], 'collect', ['x'])).toBe('');
  });
});

describe('form Perintah ke Agent (M3_TASK_014 Fase A)', () => {
  it('default: project AI baru, mode langsung jalan, timeline 14 hari', () => {
    expect(emptyMissionForm(TODAY)).toMatchObject({ projectId: 'new', mode: 'auto', start: '2026-11-04', end: '2026-11-17' });
  });

  it('validasi judul, perintah, dan timeline', () => {
    const f = emptyMissionForm(TODAY);
    expect(validateMissionForm(f)).toMatchObject({ title: 'Judul wajib diisi', instruction: 'Tulis perintah minimal 10 karakter' });
    const ok = { ...f, title: 'Kampanye', instruction: 'Siapkan kampanye Harbolnas' };
    expect(validateMissionForm(ok)).toEqual({});
    expect(validateMissionForm({ ...ok, end: '2026-11-01' }).period).toMatch(/sebelum/);
    expect(validateMissionForm({ ...ok, end: '2027-06-01' }).period).toBe('Timeline maksimal 180 hari');
  });

  it('body API: project AI → tanpa project_id; hasil yang diharapkan kosong tidak dikirim', () => {
    const f = { ...emptyMissionForm(TODAY), title: ' Kampanye ', instruction: ' Siapkan kampanye Harbolnas ' };
    expect(missionFormToBody(f)).toEqual({
      title: 'Kampanye',
      instruction: 'Siapkan kampanye Harbolnas',
      period: { start_date: '2026-11-04', end_date: '2026-11-17' },
      approval_mode: 'auto',
      execution_enabled: true,
      max_runs: 10,
    });
    // tanpa eksekusi agent → tidak ada run
    expect(missionFormToBody({ ...f, execute: false })).toMatchObject({ execution_enabled: false, max_runs: 0 });
    expect(validateMissionForm({ ...f, maxRuns: 0 }).maxRuns).toBe('1–50 run');
    expect(validateMissionForm({ ...f, execute: false, maxRuns: 0 }).maxRuns).toBeUndefined();
    expect(missionFormToBody({ ...f, projectId: 'p1', expectedOutcome: 'Kalender konten', mode: 'review' })).toMatchObject({
      project_id: 'p1',
      expected_outcome: 'Kalender konten',
      approval_mode: 'review',
    });
  });
});

describe('misi penjadwalan (M3_TASK_013)', () => {
  const item = (ref: string, executor: 'agent' | 'human') => ({
    ref,
    title: ref,
    description: '',
    start_date: '2026-11-10',
    end_date: '2026-11-11',
    priority: 'medium' as const,
    tags: [],
    executor,
    depends_on: [],
  });

  it('planCounts & tautan task induk', () => {
    const plan = { summary: '', assumptions: [], risks: [], tasks: [{ ...item('t1', 'agent'), subtasks: [item('s1', 'human'), item('s2', 'agent')] }, { ...item('t2', 'human'), subtasks: [] }] };
    expect(planCounts(plan)).toEqual({ tasks: 2, subtasks: 2, byAgent: 2 });
    expect(planCounts(null)).toEqual({ tasks: 0, subtasks: 0, byAgent: 0 });
    expect(missionTaskHref('w1', 'p1', 't9')).toBe('/w/w1/p/p1?p=t9');
    expect(missionTaskHref('w1', 'p1', null)).toBe('/w/w1/p/p1');
  });
});

describe('autocomplete MCP agent key', () => {
  const p = { agent_key: 'researcher', display_name: 'Researcher', is_active: true, capabilities: ['collect', 'analyze'] as IntelAgent['capabilities'], used_by: null };

  it('mengisi nama & handle hanya bila masih kosong', () => {
    expect(applyMcpProfile({}, p)).toEqual({ mcp_agent_key: 'researcher', name: 'Agent_Researcher', handle: 'Agent_Researcher' });
    expect(applyMcpProfile({ name: 'Peneliti', handle: 'peneliti' }, p)).toEqual({ mcp_agent_key: 'researcher', name: 'Peneliti', handle: 'peneliti' });
  });

  it('hint menyebut kapabilitas, status nonaktif, dan agent yang sudah memakainya', () => {
    expect(mcpProfileHint(p)).toBe('Kumpulkan, Analisis');
    expect(mcpProfileHint({ ...p, is_active: false, used_by: { id: 'a1', name: 'Agent_X' } })).toBe('Kumpulkan, Analisis · nonaktif di MCP · dipakai Agent_X');
    expect(mcpProfileHint({ ...p, capabilities: [] })).toBe('tanpa kapabilitas riset');
  });
});

describe('validasi wizard (M3_TASK_004)', () => {
  it('draft valid lolos semua langkah dan menjadi body API', () => {
    const d = validDraft();
    expect(firstInvalidStep(d)).toBeNull();
    const input = draftToInput(d);
    expect(input.spec.sources).toEqual([
      { type: 'x', keywords: ['kopi susu'], match: 'any', max_items: 500, exclude_retweets: true, lang: 'id' },
    ]);
    expect(input.spec.period).toEqual({ since: '2026-10-06', until: '2026-11-04' });
    expect(input.agents).toEqual({ collect: 'researcher', analyze: 'analyst' });
  });

  it('langkah 1: judul, sumber, keyword & URL', () => {
    const d = { ...validDraft(), title: '', enabled: { x: false, threads: false, web: false, trends: false } };
    expect(validateStep(d, 0)).toMatchObject({ title: 'Judul wajib diisi', sources: 'Pilih minimal satu sumber' });
    const tooMany = { ...validDraft(), x: { ...validDraft().x, keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) } };
    expect(validateStep(tooMany, 0)['x.keywords']).toBe('Maksimal 10 keyword');
    const web = {
      ...validDraft(),
      enabled: { ...validDraft().enabled, web: true },
      web: { ...validDraft().web, urls: ['javascript:alert(1)'] },
    };
    expect(validateStep(web, 0)['web.urls']).toBe('URL harus diawali http:// atau https://');
  });

  it('URL privat & kredensial ditolak lebih awal', () => {
    expect(urlError('https://contoh.id/a')).toBeNull();
    for (const bad of ['http://localhost:3000', 'http://192.168.1.2/x', 'http://10.0.0.1', 'https://user:pw@contoh.id'])
      expect(urlError(bad)).toBe('URL tidak boleh mengarah ke host privat');
    expect(urlError('bukan url')).toBe('URL tidak valid');
  });

  it('langkah 2: rentang ≤ 366 hari, tanggal berurutan, max_items dalam batas', () => {
    expect(validateStep({ ...validDraft(), since: '2026-11-05', until: '2026-11-01' }, 1).period).toMatch(/sebelum/);
    expect(validateStep({ ...validDraft(), since: '2025-01-01', until: '2026-11-01' }, 1).period).toBe('Rentang maksimal 366 hari');
    expect(validateStep({ ...validDraft(), x: { ...validDraft().x, max_items: 5001 } }, 1)['x.max_items']).toBeDefined();
    expect(validateStep(validDraft(), 1)).toEqual({});
  });

  it('langkah 3: agent wajib dipilih', () => {
    expect(validateStep({ ...validDraft(), agents: { collect: '', analyze: '' } }, 2)).toEqual({
      'agents.collect': 'Pilih agent pengumpul',
      'agents.analyze': 'Pilih agent analis',
    });
  });

  it('Masukkan ke Penjadwalan (M3_TASK_013): default aktif dengan project baru milik AI; Ulangi nonaktif', () => {
    const d = validDraft();
    expect(d.schedule).toMatchObject({ enabled: true, projectId: 'new', mode: 'auto', start: '2026-11-04', end: '2026-11-17' });
    expect(validateStep(d, 2)).toEqual({});
    expect(draftToSchedule(d)).toEqual({ period: { start_date: '2026-11-04', end_date: '2026-11-17' }, approval_mode: 'auto', execution_enabled: true });
    expect(draftToSchedule({ ...d, schedule: { ...d.schedule, execute: false } })?.execution_enabled).toBe(false);
    expect(draftToSchedule({ ...d, schedule: { ...d.schedule, enabled: false } })).toBeUndefined();
    expect(draftFromJob(job(), TODAY).schedule.enabled).toBe(false);
  });

  it('Masukkan ke Penjadwalan: project & timeline divalidasi', () => {
    const on = validDraft();
    expect(validateStep({ ...on, schedule: { ...on.schedule, projectId: '' } }, 2)['schedule.project']).toBe('Pilih project penjadwalan');
    const late = { ...on, schedule: { ...on.schedule, projectId: 'p1', start: '2026-11-20', end: '2026-11-10' } };
    expect(validateStep(late, 2)['schedule.period']).toMatch(/sebelum/);
    const long = { ...on, schedule: { ...on.schedule, projectId: 'p1', end: '2027-06-01' } };
    expect(validateStep(long, 2)['schedule.period']).toBe('Timeline maksimal 180 hari');
    const ok = { ...on, schedule: { ...on.schedule, projectId: 'p1', mode: 'review' as const } };
    expect(validateStep(ok, 2)).toEqual({});
    expect(draftToSchedule(ok)).toEqual({
      project_id: 'p1',
      period: { start_date: '2026-11-04', end_date: '2026-11-17' },
      approval_mode: 'review',
      execution_enabled: true,
    });
  });

  it('mode Ulangi mengisi draft dari spec & agent job lama', () => {
    const d = draftFromJob(job(), TODAY);
    expect(d.enabled).toEqual({ x: true, threads: false, web: true, trends: false });
    expect(d.x).toMatchObject({ keywords: ['AI marketing'], max_items: 800, match: 'all' });
    expect(d.web).toMatchObject({ mode: 'scrape', urls: ['https://contoh.id/a'] });
    expect(d.aspects).toEqual(['harga']);
    expect(d.agents).toEqual({ collect: 'id-researcher', analyze: 'id-analyst' });
    expect(firstInvalidStep(d)).toBeNull();
  });
});

describe('Knowledge Base (M3_TASK_010)', () => {
  const indexStage = (status: 'completed' | 'skipped', chunks?: number) => ({
    stage: 'index' as const,
    agent_id: 'id-strategist',
    agent_key: 'strategist',
    status,
    progress_done: 0,
    progress_total: null,
    error: null,
    started_at: null,
    finished_at: null,
    stats: chunks === undefined ? null : { documents: 6, chunks },
  });

  it('toggle mati → body tanpa agent index; nyala → agent index wajib & ikut terkirim', () => {
    expect(emptyDraft(TODAY).saveToKb).toBe(false);
    const off = { ...validDraft(), agents: { collect: 'researcher', analyze: 'analyst', index: 'strategist' } };
    expect(draftToInput(off).agents).toEqual({ collect: 'researcher', analyze: 'analyst' });

    const on = { ...validDraft(), saveToKb: true };
    expect(validateStep(on, 2)).toEqual({ 'agents.index': 'Pilih agent indeks' });
    const chosen = { ...on, agents: { ...on.agents, index: 'strategist' } };
    expect(firstInvalidStep(chosen)).toBeNull();
    expect(draftToInput(chosen).agents).toEqual({ collect: 'researcher', analyze: 'analyst', index: 'strategist' });
  });

  it('agent tahap Indeks: hanya kapabilitas index; default dari stage-defaults', () => {
    expect(capableFor(AGENTS, 'index').map((a) => a.name)).toEqual(['researcher', 'analyst', 'strategist']);
    expect(agentOption(AGENTS[3], 'index', ['x'])).toEqual({ disabled: true, reason: 'Tidak punya kapabilitas Indeks' });
    const defaults = { index: { id: 'strategist', name: 'strategist', mcp_agent_key: 'strategist' } };
    expect(defaultAgentId(AGENTS, 'index', ['x'], defaults)).toBe('strategist');
  });

  it('mode Ulangi mempertahankan pilihan simpan ke KB', () => {
    const d = draftFromJob(job({ stages: [...job().stages, indexStage('completed', 7)] }), TODAY);
    expect(d.saveToKb).toBe(true);
    expect(d.agents.index).toBe('id-strategist');
    expect(draftFromJob(job(), TODAY).saveToKb).toBe(false);
  });

  it('event aliran 3D (M3_TASK_011): tahap berjalan + token live; total null → done', () => {
    const analyzed = job().stages.map((s) => ({ ...s, status: 'completed' as const }));
    const running = job({
      stages: [...analyzed, { ...indexStage('completed'), status: 'running', progress_done: 64, progress_total: 200 }],
    });
    expect(flowEventFromJob(running, ['kopi'])).toEqual({ stage: 'index', done: 64, total: 200, sample_tokens: ['kopi'] });
    // analyze berjalan (fixture default), total diketahui
    expect(flowEventFromJob(job(), [])).toEqual({ stage: 'analyze', done: 120, total: 500, sample_tokens: [] });
    const done = job({ status: 'completed', stages: job().stages.map((s) => ({ ...s, status: 'completed', progress_total: null })) });
    expect(flowEventFromJob(done, [])).toMatchObject({ stage: 'analyze', total: done.stages[1].progress_done });
    expect(flowEventFromJob(job({ stages: [] }), [])).toBeNull();
  });

  it('badge KB: jumlah chunk hanya bila tahap index selesai', () => {
    expect(kbChunks(job({ stages: [...job().stages, indexStage('completed', 7)] }))).toBe(7);
    expect(kbChunks(job({ stages: [...job().stages, indexStage('skipped')] }))).toBeNull();
    expect(kbChunks(job())).toBeNull();
  });
});

describe('aturan tombol & real-time', () => {
  it('Batalkan hanya saat aktif; Ulangi hanya saat terminal', () => {
    expect(['queued', 'collecting', 'analyzing', 'indexing'].every((s) => canCancel(s as never))).toBe(true);
    expect(canCancel('completed') || canCancel('cancelling')).toBe(false);
    expect(['failed', 'cancelled', 'completed'].every((s) => canRetry(s as never))).toBe(true);
    expect(canRetry('analyzing')).toBe(false);
  });

  it('event intel.job.updated memperbarui status & progres tahap tanpa mutasi', () => {
    const before = job();
    const after = applyJobUpdate(before, {
      id: 'job-1',
      status: 'completed',
      total_items: 500,
      stages: [{ stage: 'analyze', status: 'completed', progress: { done: 500, total: 500 } }],
    });
    expect(after.status).toBe('completed');
    expect(after.stages[1]).toMatchObject({ status: 'completed', progress_done: 500 });
    expect(after.stages[0]).toBe(before.stages[0]);
    expect(before.stages[1].status).toBe('running');
    expect(applyJobUpdate(before, { id: 'lain', status: 'failed', total_items: null, stages: [] })).toBe(before);
  });
});

describe('model laporan (M3_TASK_005)', () => {
  it('JobView → tampilan: dominan, net, volume per sentimen, aspek', () => {
    const v = buildInsightView(INSIGHT);
    expect(v.dominant).toEqual({ key: 'positive', share: 0.6 });
    expect(v.net).toBe(0.5);
    expect(v.volume.series.map((s) => s.key)).toEqual(['positive', 'neutral', 'negative']);
    expect(v.volume.rows[0]).toEqual({ day: '2026-10-01', positive: 12, neutral: 6, negative: 2 });
    expect(v.aspects[0]).toMatchObject({ aspect: 'harga', mentions: 40, net: -0.25 });
  });

  it('tanpa sentimen, volume ditampilkan per sumber', () => {
    const v = buildInsightView({
      ...INSIGHT,
      sentiment: null,
      volume_by_day: {
        cols: ['day', 'source', 'count'],
        rows: [
          ['2026-10-01', 'x', 3],
          ['2026-10-01', 'web', 2],
          ['2026-10-02', 'x', 1],
        ],
      },
    });
    expect(v.dominant).toBeNull();
    expect(v.volume.rows).toEqual([
      { day: '2026-10-01', x: 3, web: 2 },
      { day: '2026-10-02', x: 1 },
    ]);
  });

  it('angka laporan ekspor identik dengan tampilan', () => {
    const m = buildIntelReportModel(job({ status: 'completed' }), 'Marketing Demo', () => 'Agent_Analyst', TODAY);
    expect(m.kpis.map((k) => k.value)).toEqual(['60% Positif', formatNet(0.5), '500', formatUsd(0.094)]);
    expect(m.summary).toEqual([
      { kind: 'heading', text: 'Ringkasan' },
      { kind: 'bullet', text: 'Sentimen dominan positif (60%).' },
    ]);
    expect(m.volume).toEqual({ cols: ['Hari', 'Positif', 'Netral', 'Negatif'], rows: [['2026-10-01', 12, 6, 2]] });
    expect(m.stages.find((s) => s.stage === 'Analisis')).toMatchObject({ tokens: 38211, usd: 0.094 });
  });
});

describe('markdown aman (anti-XSS)', () => {
  it('menolak link selain http/https dan tidak menghasilkan HTML', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('https://contoh.id/a')).toBe('https://contoh.id/a');
    for (const evil of ['[klik](javascript:alert(1))', '[klik](javascript:void0)', '[x](data:text/html;base64,AAA)']) {
      expect(parseInline(evil).some((i) => i.kind === 'link')).toBe(false);
    }
    const blocks = parseMarkdown('<img src=x onerror=alert(1)>\n\n**tebal** dan [aman](https://contoh.id)');
    expect(blocks[0]).toEqual({ kind: 'paragraph', inline: [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }] });
    expect(blocks[1]).toMatchObject({
      inline: [
        { kind: 'bold', text: 'tebal' },
        { kind: 'text', text: ' dan ' },
        { kind: 'link', href: 'https://contoh.id/' },
      ],
    });
  });

  it('heading, bullet, dan daftar bernomor', () => {
    expect(parseMarkdown('# A\n- satu\n- dua\n1. x').map((b) => b.kind)).toEqual(['heading', 'list', 'list']);
  });
});
