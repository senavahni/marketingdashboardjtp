/**
 * Pembangkit fixture kontrak 1.3 → `contracts/1.3/fixtures/*.json` + `contracts/1.3/SHA256SUMS`.
 * Fixture adalah sumber kebenaran bersama Dashboard (Zod) & MCP (Pydantic): salin folder `contracts/1.3/`
 * apa adanya ke repo MCP; kedua sisi harus menerima fixture valid dan menolak fixture invalid pada `expect_path`.
 *
 * Jalankan: npm run contract:fixtures   (lalu `npm test -- intel-1.3-fixtures`)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface Fixture {
  name: string;
  schema: string;
  valid: boolean;
  payload: unknown;
  expect_path?: string;
}

const WS = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const PRODUCT = '44444444-4444-4444-8444-444444444444';
const COMPANY = '55555555-5555-4555-8555-555555555555';
const CONTACT = '66666666-6666-4666-8666-666666666666';
const EVENT = '77777777-7777-4777-8777-777777777777';
const MCP_JOB = 'j_0123456789';
const AT = '2026-11-09T03:00:00Z';
const SRC = { source_url: 'https://contoh.co.id/kontak', source_kind: 'web', collected_at: AT };

const base = { title: 'Uji 1.3', language: 'id', llm_assist: false, budget_usd: 2.5, agents: {} };
const SPECS: Record<string, Record<string, unknown>> = {
  company_discovery: { ...base, kind: 'company_discovery', params: { product_id: PRODUCT, region: { scope: 'province', codes: ['32'] }, max_companies: 50 } },
  company_import: { ...base, kind: 'company_import', params: { upload_id: 'u_abc123def4', sheet: 'Sheet1', mode: 'contact_targets' } },
  contact_finder: { ...base, kind: 'contact_finder', params: { import_batch_id: 'ib_abc123def4', rerun_statuses: ['not_found'] } },
  social_listening: {
    ...base,
    kind: 'social_listening',
    params: { product_id: PRODUCT, keywords: [], platforms: ['x', 'threads'], period: { since: '2026-10-01', until: '2026-10-31' } },
  },
  book_ingest: { ...base, kind: 'book_ingest', params: { upload_id: 'u_abc123def4', asset_kind: 'book', title: 'Buku Marketing', usage_rights_confirmed: true } },
  opportunity_scoring: { ...base, kind: 'opportunity_scoring', agents: { score: 'analyst' }, params: { product_id: PRODUCT } },
  strategy: {
    ...base,
    kind: 'strategy',
    params: {
      product_id: PRODUCT,
      objective: 'Meningkatkan lead instansi pendidikan di Jawa Barat',
      period: { since: '2026-12-01', until: '2027-02-28' },
      insight_refs: [{ kind: 'social_report', ref: 'j_0123456789' }],
    },
  },
  content_bank: { ...base, kind: 'content_bank', params: { strategy_report_id: 'sr_abc123def4', count: 30, platforms: ['instagram', 'linkedin'], period: { since: '2026-12-01', until: '2026-12-31' } } },
};

const estimate = {
  kind: 'company_discovery',
  duration_seconds: { min: 3_600, max: 21_600 },
  llm: { tokens_est: 12_000, usd_est: 0.05, llm_assist_usd_est: 0, by_stage: [{ stage: 'product_analysis', agent_key: 'analyst', route: 'smart', tokens_est: 12_000 }] },
  external: { units: 0, usd: 0 },
  requires_confirmation: false,
  warnings: [{ code: 'CHROME_RATE', message: 'Discovery dibatasi volume Chrome' }],
};
const cost = { llm_tokens: 1000, usd_llm: 0.01, external_units: 0, usd_external: 0, by_stage: [], budget_usd: 2.5 };
const jobView = (status: string, extra: Record<string, unknown> = {}) => ({
  mcp_job_id: MCP_JOB,
  dashboard_job_id: JOB,
  kind: 'company_discovery',
  status,
  stages: [
    {
      stage: 'product_analysis',
      agent_key: 'analyst',
      status: status === 'awaiting_review' ? 'awaiting_review' : 'completed',
      progress: { done: 1, total: 1 },
      review:
        status === 'awaiting_review'
          ? { review_id: 'r_abc123def4', subject_type: 'product_analysis', subject_ref: 'pa_abc123def4', summary: '3 industri, 4 segmen', non_blocking: false }
          : null,
    },
    { stage: 'discovery', agent_key: 'prospector', status: status === 'paused' ? 'paused' : 'pending', progress: { done: 12, total: 50 } },
  ],
  cost,
  ...extra,
});
const env = (event_type: string, data: Record<string, unknown>, sequence = 2) => ({
  contract_version: '1.3',
  event_id: EVENT,
  event_type,
  occurred_at: AT,
  job_id: JOB,
  mcp_job_id: MCP_JOB,
  sequence,
  data,
});
const company = {
  company_id: COMPANY,
  name: 'SMK Negeri 1 Bandung',
  org_type: 'education',
  kbli_code: '85',
  isic_code: 'P85',
  region: { province_code: '32', province_name: 'Jawa Barat', regency_code: '32.73', regency_name: 'Kota Bandung' },
  completeness: 0.7,
  top_score: 81.5,
  origin: 'import',
  updated_at: AT,
};
const draft = {
  item_ref: 'ci_abc123def4',
  platform: 'instagram',
  format: 'carousel',
  pillar: 'Edukasi',
  funnel_stage: 'awareness',
  segment: 'SMK',
  hook: 'Laporan sekolah masih manual?',
  caption: 'Lima langkah digitalisasi laporan ...',
  cta: 'Unduh panduan',
  hashtags: ['#sekolahdigital', 'edtech'],
  visual_brief: 'Carousel 5 slide, ilustrasi guru & dasbor',
  framework_refs: [{ card_id: 'kc_abc123def4', card_title: 'AIDA', book_title: 'Buku Marketing', page: 42 }],
  insight_refs: [{ kind: 'segment', ref: 'sg_abc123def4', label: 'SMK negeri' }],
  eval_score: 0.82,
  eval_reason: 'Hook kuat, CTA jelas',
};

const set = (obj: unknown, path: string, value: unknown): unknown => {
  const clone = structuredClone(obj) as Record<string, unknown>;
  const keys = path.split('.');
  let cur: Record<string, unknown> = clone;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
  return clone;
};

const valid = (name: string, schema: string, payload: unknown): Fixture => ({ name: `valid_${name}`, schema, valid: true, payload });
const invalid = (name: string, schema: string, payload: unknown, expect_path: string): Fixture => ({ name: `invalid_${name}`, schema, valid: false, payload, expect_path });

const createInput = (spec: unknown) => ({
  contract_version: '1.3',
  dashboard_job_id: JOB,
  workspace_id: WS,
  requested_by: { user_id: USER, name: 'Owner Demo' },
  spec,
  confirm_cost: false,
});
const reviewInput = { workspace_id: WS, mcp_job_id: MCP_JOB, review_id: 'r_abc123def4', decision: 'approve', edits: { segments: ['SMK'] }, decided_by: { user_id: USER, name: 'Owner Demo' } };

const FIXTURES: Fixture[] = [
  ...Object.entries(SPECS).map(([kind, spec]) => valid(`spec_${kind}`, 'job_spec', spec)),
  invalid('spec_unknown_kind', 'job_spec', set(SPECS.strategy, 'kind', 'lead_gen'), 'kind'),
  invalid('spec_budget_negative', 'job_spec', set(SPECS.company_discovery, 'budget_usd', -1), 'budget_usd'),
  invalid('spec_budget_over_max', 'job_spec', set(SPECS.company_discovery, 'budget_usd', 101), 'budget_usd'),
  invalid('spec_extra_field', 'job_spec', set(SPECS.company_discovery, 'priority', 'high'), 'priority'),
  invalid('spec_agent_unknown_stage', 'job_spec', set(SPECS.opportunity_scoring, 'agents', { collect: 'researcher' }), 'agents.collect'),
  invalid('spec_discovery_region_code', 'job_spec', set(SPECS.company_discovery, 'params.region.codes', ['JABAR']), 'params.region.codes'),
  invalid('spec_discovery_max_companies', 'job_spec', set(SPECS.company_discovery, 'params.max_companies', 501), 'params.max_companies'),
  invalid('spec_import_upload_id', 'job_spec', set(SPECS.company_import, 'params.upload_id', 'file.xlsx'), 'params.upload_id'),
  invalid('spec_import_mode', 'job_spec', set(SPECS.company_import, 'params.mode', 'append'), 'params.mode'),
  invalid('spec_contact_finder_empty', 'job_spec', set(SPECS.contact_finder, 'params', { rerun_statuses: [] }), 'params.target_ids'),
  invalid('spec_social_no_platform', 'job_spec', set(SPECS.social_listening, 'params.platforms', []), 'params.platforms'),
  invalid('spec_social_period_too_long', 'job_spec', set(SPECS.social_listening, 'params.period', { since: '2025-01-01', until: '2026-10-31' }), 'params.period'),
  invalid('spec_book_rights_missing', 'job_spec', set(SPECS.book_ingest, 'params.usage_rights_confirmed', false), 'params.usage_rights_confirmed'),
  invalid('spec_strategy_period_reversed', 'job_spec', set(SPECS.strategy, 'params.period', { since: '2027-01-01', until: '2026-12-01' }), 'params.period.until'),
  invalid('spec_content_count', 'job_spec', set(SPECS.content_bank, 'params.count', 61), 'params.count'),
  invalid('spec_content_platform', 'job_spec', set(SPECS.content_bank, 'params.platforms', ['facebook']), 'params.platforms'),

  valid('estimate_input', 'job_estimate_input', { workspace_id: WS, spec: SPECS.company_discovery }),
  valid('create_input', 'job_create_input', createInput(SPECS.company_import)),
  valid('create_input_contract_1_10', 'job_create_input', { ...createInput(SPECS.book_ingest), contract_version: '1.10' }),
  invalid('create_contract_1_2', 'job_create_input', { ...createInput(SPECS.book_ingest), contract_version: '1.2' }, 'contract_version'),
  valid('review_input', 'job_review_input', reviewInput),
  invalid('review_revise_without_comment', 'job_review_input', { ...reviewInput, decision: 'revise' }, 'comment'),
  invalid('review_bad_review_id', 'job_review_input', { ...reviewInput, review_id: 'review-1' }, 'review_id'),
  valid('resume_input', 'job_resume_input', { workspace_id: WS, mcp_job_id: MCP_JOB }),

  valid('estimate', 'estimate', estimate),
  valid('job_accepted', 'job_accepted', { accepted: true, mcp_job_id: MCP_JOB, kind: 'company_discovery', estimate }),
  valid('job_view_awaiting_review', 'job_view', jobView('awaiting_review')),
  valid(
    'job_view_paused_captcha',
    'job_view',
    jobView('paused', { pause: { reason: 'captcha', message: 'Google meminta CAPTCHA', since: AT, resume_hint: 'Selesaikan CAPTCHA di profil Chrome lalu klik Lanjutkan' } }),
  ),
  valid(
    'job_view_completed',
    'job_view',
    jobView('completed', { result: { summary: '48 perusahaan', refs: { company_index: 'companies' }, counts: { companies: 48 }, partial: false, warnings: [] } }),
  ),
  invalid('job_view_bad_pause_reason', 'job_view', jobView('paused', { pause: { reason: 'rate_limit', message: 'x', since: AT } }), 'pause.reason'),
  invalid('job_view_unknown_status', 'job_view', jobView('waiting'), 'status'),
  valid('review_output', 'job_review_output', { accepted: true, status: 'running' }),
  valid('resume_output', 'job_resume_output', { resumed: true, status: 'running' }),

  valid('upload_accepted', 'upload_accepted', { upload_id: 'u_abc123def4', kind: 'pdf', filename: 'buku.pdf', size: 104_857_600, sha256: 'a'.repeat(64), status: 'stored' }),
  invalid('upload_too_large', 'upload_accepted', { upload_id: 'u_abc123def4', kind: 'pdf', filename: 'buku.pdf', size: 104_857_601, sha256: 'a'.repeat(64), status: 'stored' }, 'size'),

  valid('mi_kpis_input', 'mi_kpis_input', { workspace_id: WS, period: { since: '2026-10-01', until: '2026-10-31' }, compare: 'previous_period' }),
  valid('mi_kpis', 'mi_kpis', {
    kpis: [
      { key: 'companies_total', label: 'Perusahaan', value: 1240, unit: 'count', delta: 0.12, definition: 'Perusahaan aktif di workspace', period: { since: '2026-10-01', until: '2026-10-31' }, source: 'ci_companies', as_of: AT, insufficient_data: false },
      { key: 'win_rate', label: 'Win rate', value: null, unit: 'percent', definition: 'won / (won+lost)', period: { since: '2026-10-01', until: '2026-10-31' }, source: 'opportunities', as_of: AT, insufficient_data: true },
    ],
    as_of: AT,
  }),
  valid('ci_company_list_input', 'ci_company_list_input', { workspace_id: WS, filter: { region_codes: ['32'], org_types: ['education'] }, limit: 200 }),
  invalid('ci_company_list_limit', 'ci_company_list_input', { workspace_id: WS, limit: 201 }, 'limit'),
  valid('ci_company_list', 'ci_company_list', { items: [company], next_cursor: 'c2', total_estimate: 1240 }),
  invalid('ci_company_list_no_total', 'ci_company_list', { items: [company], next_cursor: null }, 'total_estimate'),
  valid('company_profile', 'company_profile', {
    ...company,
    description_quotes: [{ quote: 'Sekolah kejuruan unggulan', source: SRC }],
    domains: [{ domain: 'smkn1bdg.sch.id', is_primary: true, confidence: 0.95 }],
    locations: [{ address_raw: 'Jl. Wastukencana 3', region_code: '32.73', lat: -6.9, lng: 107.6, precision: 'street', geocode_source: 'gmaps' }],
    contacts: [
      { contact_id: CONTACT, kind: 'email', value: 'info@smkn1bdg.sch.id', contact_type: 'generic', review_status: 'approved', suppressed: false, source: SRC },
      { contact_id: EVENT, kind: 'email', value: 'budi@smkn1bdg.sch.id', contact_type: 'personal', person_name: 'Budi', job_title: 'Kepala TU', review_status: 'pending', suppressed: false, source: SRC },
    ],
    needs: [{ need: 'Sistem administrasi siswa', category: 'software', confidence: 0.7, evidence: [{ quote: 'membutuhkan aplikasi', source: SRC }] }],
    signals: [],
    scores: [{ product_id: PRODUCT, score: 81.5, priority: 'high', score_model_version: 'v1' }],
  }),
  valid('ci_geo_clusters_input', 'ci_geo_clusters_input', { workspace_id: WS, bbox: [95, -11, 141, 6], zoom: 5 }),
  invalid('ci_geo_clusters_bbox', 'ci_geo_clusters_input', { workspace_id: WS, bbox: [141, -11, 95, 6], zoom: 5 }, 'bbox'),
  valid('geo_clusters', 'geo_clusters', {
    clusters: [
      { id: 'c1', lat: -6.9, lng: 107.6, count: 42, top_priority: 'high' },
      { id: 'c2', lat: -6.2, lng: 106.8, count: 1, company_id: COMPANY, precision: 'street' },
    ],
    total: 43,
  }),
  valid('opp_list_input', 'opp_list_input', { workspace_id: WS, filter: { product_id: PRODUCT, priorities: ['high'], insufficient_data: false } }),
  valid('opp_list', 'opp_list', {
    items: [{ company_id: COMPANY, company_name: 'SMK Negeri 1 Bandung', product_id: PRODUCT, score: 81.5, priority: 'high', confidence: 0.6, insufficient_data: false, score_model_version: 'v1', scored_at: AT }],
    next_cursor: null,
    total_estimate: 1,
  }),
  valid('opp_explain', 'opp_explain', {
    score: 81.5,
    confidence: 0.6,
    score_model_version: 'v1',
    components: [
      { key: 'product_fit', label: 'Kecocokan produk', weight: 0.5, value: 0.9, known: true, evidence: [{ quote: 'membutuhkan aplikasi', source: SRC }] },
      { key: 'size', label: 'Ukuran', weight: 0.2, value: null, known: false, evidence: [] },
    ],
    missing_info: ['Jumlah siswa'],
  }),
  invalid('opp_explain_weight', 'opp_explain', { score: 50, confidence: 0.5, score_model_version: 'v1', components: [{ key: 'k', label: 'l', weight: 1.5, value: 0.1, known: true }] }, 'components.0.weight'),
  valid('ct_batch', 'ct_batch', { batch_id: 'cb_abc123def4', strategy_report_id: 'sr_abc123def4', items: [draft] }),
  invalid('ct_batch_platform', 'ct_batch', { batch_id: 'cb_abc123def4', strategy_report_id: 'sr_abc123def4', items: [{ ...draft, platform: 'facebook' }] }, 'items.0.platform'),
  valid('kn_asset_list', 'kn_asset_list', {
    items: [{ asset_id: 'ka_abc123def4', upload_id: 'u_abc123def4', title: 'Buku Marketing', kind: 'book', status: 'ready', pages: 480, chunks: 1900, needs_ocr: false, error: null }],
    next_cursor: null,
    total_estimate: 1,
  }),
  valid('data_export_input', 'data_export_input', { workspace_id: WS, dataset: 'companies', format: 'xlsx' }),
  valid('data_export', 'data_export', { export_id: 'ex_abc123def4', rows: 1240, download_path: '/exports/ex_abc123def4', expires_at: AT, sanitized: true }),
  invalid('data_export_unsanitized', 'data_export', { export_id: 'ex_abc123def4', rows: 1, download_path: '/exports/ex_abc123def4', expires_at: AT, sanitized: false }, 'sanitized'),

  valid('event_stage_started_new_kind', 'event', env('intel.job.stage.started', { stage: 'product_analysis', agent_key: 'analyst' })),
  valid('event_progress_eta', 'event', env('intel.job.progress', { stage: 'discovery', done: 12, total: 50, eta_seconds: 7200 })),
  valid('event_awaiting_review', 'event', env('intel.job.awaiting_review', { stage: 'product_analysis', review_id: 'r_abc123def4', subject_type: 'product_analysis', subject_ref: 'pa_abc123def4', summary: '3 industri' })),
  valid('event_paused_captcha', 'event', env('intel.job.paused', { stage: 'discovery', reason: 'captcha', message: 'CAPTCHA Google', resume_hint: 'Selesaikan di Chrome' })),
  valid('event_paused_local_model', 'event', env('intel.job.paused', { stage: 'embed', reason: 'local_model_unavailable', message: 'embed-local mati' })),
  valid('event_company_upserted', 'event', env('intel.company.upserted', { company_id: COMPANY, name: 'SMK Negeri 1 Bandung', origin: 'discovery', created: true })),
  valid('event_import_status', 'event', env('ci.import.status', { batch_id: 'ib_abc123def4', status: 'inserting', rows_total: 1000, rows_inserted: 400, rows_merged: 20, rows_review: 5, rows_failed: 1 })),
  valid('event_asset_status', 'event', env('kn.asset.status', { asset_id: 'ka_abc123def4', upload_id: 'u_abc123def4', status: 'embedding', pages: 480, chunks: 900 })),
  valid('event_scores_updated', 'event', env('opp.scores.updated', { product_id: PRODUCT, scored: 120, insufficient_data: 8, score_model_version: 'v1' })),
  valid('event_batch_ready', 'event', env('ct.batch.ready', { batch_id: 'cb_abc123def4', strategy_report_id: 'sr_abc123def4', items_count: 30 })),
  valid('event_completed', 'event', env('intel.job.completed', { summary_preview: '48 perusahaan', totals: { counts: { companies: 48 } }, cost, partial: false })),
  invalid('event_unknown_type', 'event', env('intel.job.exploded', {}), 'event_type'),
  invalid('event_contract_1_2', 'event', { ...env('intel.job.paused', { reason: 'captcha', message: 'x' }), contract_version: '1.2' }, 'contract_version'),
  invalid('event_paused_bad_reason', 'event', env('intel.job.paused', { reason: 'tired', message: 'x' }), 'data.reason'),
  invalid('event_review_bad_subject', 'event', env('intel.job.awaiting_review', { stage: 's1', review_id: 'r_abc123def4', subject_type: 'invoice', subject_ref: 'x', summary: 'x' }), 'data.subject_type'),
  invalid('event_import_rows_over_max', 'event', env('ci.import.status', { batch_id: 'ib_abc123def4', status: 'inserting', rows_total: 50_001, rows_inserted: 0, rows_merged: 0, rows_review: 0, rows_failed: 0 }), 'data.rows_total'),
  invalid('event_batch_extra_field', 'event', env('ct.batch.ready', { batch_id: 'cb_abc123def4', strategy_report_id: 'sr_abc123def4', items_count: 3, url: 'x' }), 'data.url'),
];

function main(): void {
  const dir = resolve(__dirname, '../../../contracts/1.3');
  const fixturesDir = join(dir, 'fixtures');
  rmSync(fixturesDir, { recursive: true, force: true });
  mkdirSync(fixturesDir, { recursive: true });
  const names = new Set<string>();
  for (const fx of FIXTURES) {
    if (names.has(fx.name)) throw new Error(`nama fixture ganda: ${fx.name}`);
    names.add(fx.name);
    writeFileSync(join(fixturesDir, `${fx.name}.json`), `${JSON.stringify(fx, null, 2)}\n`);
  }
  const sums = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => `${createHash('sha256').update(readFileSync(join(fixturesDir, f))).digest('hex')}  fixtures/${f}`);
  writeFileSync(join(dir, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  process.stdout.write(`${FIXTURES.length} fixture ditulis ke ${dir}\n`);
}

main();
