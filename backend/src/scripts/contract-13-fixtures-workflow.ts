/**
 * Fixture kontrak 1.3 aditif: Import & Contact Finder (DSH-V1-06) + Knowledge Library (DSH-V1-09).
 * Diimpor oleh export-contract-13-fixtures.ts; payload `valid_*` juga dipakai mock MCP sebagai respons.
 */

export interface Fixture {
  name: string;
  schema: string;
  valid: boolean;
  payload: unknown;
  expect_path?: string;
}

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';
const JOB = '22222222-2222-4222-8222-222222222222';
const COMPANY = '55555555-5555-4555-8555-555555555555';
const COMPANY_2 = '88888888-8888-4888-8888-888888888888';
const AT = '2026-11-10T02:00:00Z';

const valid = (name: string, schema: string, payload: unknown): Fixture => ({ name: `valid_${name}`, schema, valid: true, payload });
const invalid = (name: string, schema: string, payload: unknown, expect_path: string): Fixture => ({ name: `invalid_${name}`, schema, valid: false, payload, expect_path });

const batch = {
  batch_id: 'ib_abc123def4',
  upload_id: 'u_abc123def4',
  dashboard_job_id: JOB,
  filename: 'daftar-instansi-jabar.xlsx',
  sheet: 'Sekolah',
  mode: 'contact_targets',
  status: 'inserting',
  rows_total: 1000,
  rows_inserted: 640,
  rows_merged: 42,
  rows_review: 9,
  rows_failed: 3,
  created_at: AT,
  rolled_back_at: null,
};
const mapping = [
  { source_col: 'Kab/Kota', field: 'location.regency_code', transform: 'kemendagri_lookup', confidence: 0.64, method: 'local' },
  { source_col: 'Nama Sekolah', field: 'name', transform: 'trim', confidence: 0.98, method: 'local' },
  { source_col: 'Alamat Lengkap', field: 'location.address_raw', transform: null, confidence: 0.91, method: 'local' },
  { source_col: 'Telp', field: 'contact.phone_generic', transform: 'phone_e164', confidence: 0.77, method: 'local' },
  { source_col: 'Catatan', field: null, transform: null, confidence: null, method: 'local' },
];
const fields = [
  { field: 'name', label: 'Nama organisasi' },
  { field: 'location.address_raw', label: 'Alamat' },
  { field: 'location.regency_code', label: 'Kab/Kota (kode Kemendagri)' },
  { field: 'contact.phone_generic', label: 'Telepon umum' },
  { field: 'contact.email_generic', label: 'E-mail umum' },
  { field: 'website', label: 'Website' },
  { field: 'sector', label: 'Sektor (→ KBLI)' },
];
const row = {
  row_id: 'ir_abc123def4',
  row_no: 18,
  raw: { 'Nama Sekolah': 'SMKN 1 Bdg', 'Alamat Lengkap': 'Jl. Wastukencana 3', 'Kab/Kota': 'Bandung' },
  status: 'review',
  issues: ['Mirip perusahaan yang sudah ada'],
  candidates: [{ company_id: COMPANY, name: 'SMK Negeri 1 Bandung', address: 'Jl. Wastukencana No. 3, Bandung', similarity: 0.88 }],
};
const target = (status: string, extra: Record<string, unknown> = {}) => ({
  target_id: 'cf_abc123def4',
  company_id: COMPANY,
  name: 'SMA Harapan Cimahi',
  kbli_code: '85',
  region_name: 'Kota Cimahi',
  priority: 2,
  hint: { city: 'Cimahi' },
  status,
  attempts: 1,
  candidates: [],
  found: null,
  last_attempt_at: AT,
  ...extra,
});
const candidates = [
  { candidate_id: 'cc_abc123def4', name: 'SMA Harapan', address: 'Jl. Amir Machmud 12, Cimahi', domain: 'smaharapan.sch.id', distance_km: 0.4, reason: 'Nama & kota cocok, domain .sch.id', confidence: 0.71 },
  { candidate_id: 'cc_bcd234efg5', name: 'SMA Harapan Bangsa', address: 'Jl. Baros 5, Cimahi', domain: null, distance_km: 3.1, reason: 'Nama mirip, tanpa website', confidence: 0.44 },
];
const card = {
  card_id: 'kc_abc123def4',
  asset_id: 'ka_abc123def4',
  book_title: 'Buku Marketing',
  card_type: 'framework',
  title: 'AIDA',
  body: 'Attention → Interest → Desire → Action. Gunakan hook yang memicu perhatian sebelum menjelaskan manfaat.',
  page_from: 42,
  page_to: 44,
  roles: ['strategist', 'creative'],
  status: 'draft',
  version: 1,
};
const doctrineVersion = (version: number, approved: boolean) => ({
  version,
  text: `Doktrin creative v${version}:\n- Mulai dengan hook yang spesifik.\n- Satu CTA per konten.${version > 1 ? '\n- Sesuaikan format dengan platform.' : ''}`,
  tokens: 420 + version * 30,
  card_ids: ['kc_abc123def4'],
  created_at: AT,
  approved_at: approved ? AT : null,
});
const playbook = {
  playbook_id: 'pb_abc123def4',
  name: 'Analisis segmen sekolah',
  role: 'analyst',
  version: 2,
  updated_at: AT,
  last_run_at: null,
  yaml: 'name: Analisis segmen sekolah\nrole: analyst\nsteps:\n  - tool: ci_company_list\n    filter: { org_types: [education] }\n  - tool: kn_retrieve\n    query: segmentasi pendidikan\n',
  versions: [
    { version: 2, created_at: AT, created_by: 'Owner Demo' },
    { version: 1, created_at: AT, created_by: 'curator' },
  ],
  runs: [{ run_id: 'pr_abc123def4', status: 'completed', started_at: AT, finished_at: AT }],
};
const node = (id: string, label: string, type: string) => ({ node_id: id, label, type, definition: type === 'framework' ? `${label} — kerangka dari Buku Marketing` : null });
const edge = (id: string, source: string, targetId: string, relation: string) => ({
  edge_id: id,
  source,
  target: targetId,
  relation,
  provenance: { card_id: 'kc_abc123def4', book_title: 'Buku Marketing', page: 42, source_url: null },
});
const graph = {
  nodes: [node('kn_aida000001', 'AIDA', 'framework'), node('kn_hook000001', 'Hook', 'concept'), node('kn_smk0000001', 'SMK negeri', 'segment')],
  edges: [edge('ke_000000001a', 'kn_aida000001', 'kn_hook000001', 'memuat'), edge('ke_000000002b', 'kn_aida000001', 'kn_smk0000001', 'diterapkan_pada')],
  truncated: false,
};

export const WORKFLOW_FIXTURES: Fixture[] = [
  // Import
  valid('upload_profile', 'upload_profile', {
    upload_id: 'u_abc123def4',
    sheets: [
      {
        name: 'Sekolah',
        rows_estimate: 1000,
        headers: ['Nama Sekolah', 'Alamat Lengkap', 'Kab/Kota', 'Telp', 'Catatan'],
        preview: [['SMK Negeri 1 Bandung', 'Jl. Wastukencana 3', 'Kota Bandung', '022-4206800', '']],
      },
      { name: 'Ringkasan', rows_estimate: 4, headers: ['Wilayah', 'Jumlah'], preview: [['Bandung', '412']] },
    ],
  }),
  invalid('upload_profile_no_sheet', 'upload_profile', { upload_id: 'u_abc123def4', sheets: [] }, 'sheets'),
  valid('import_batch_list', 'import_batch_list', { items: [batch], next_cursor: null, total_estimate: 1 }),
  valid('import_batch_detail', 'import_batch_detail', { ...batch, column_mapping: mapping, fields }),
  invalid('import_batch_bad_method', 'import_batch_detail', { ...batch, column_mapping: [{ ...mapping[0], method: 'magic' }], fields }, 'column_mapping.0.method'),
  invalid('import_batch_rows_over_max', 'import_batch_detail', { ...batch, rows_total: 50_001, column_mapping: mapping, fields }, 'rows_total'),
  valid('import_row_list', 'import_row_list', { items: [row], next_cursor: null, total_estimate: 9 }),
  valid('import_row_decide_input', 'import_row_decide_input', { workspace_id: WS, batch_id: 'ib_abc123def4', row_id: 'ir_abc123def4', decision: 'merge', company_id: COMPANY, decided_by: USER }),
  invalid('import_row_merge_without_company', 'import_row_decide_input', { workspace_id: WS, batch_id: 'ib_abc123def4', row_id: 'ir_abc123def4', decision: 'merge', decided_by: USER }, 'company_id'),
  valid('import_row_decision', 'import_row_decision', { row_id: 'ir_abc123def4', status: 'merged' }),
  valid('import_rollback_preview', 'import_rollback', { batch_id: 'ib_abc123def4', dry_run: true, companies_deleted: 640, merges_reverted: 42, kept_in_use: 12, status: 'completed' }),
  valid('import_rollback_done', 'import_rollback', { batch_id: 'ib_abc123def4', dry_run: false, companies_deleted: 628, merges_reverted: 42, kept_in_use: 12, status: 'rolled_back' }),
  // Contact Finder
  valid('cf_target_list', 'cf_target_list', {
    items: [
      target('found', { found: { website: 'smkn1bdg.sch.id', phone: '+62224206800', email_generic: 'info@smkn1bdg.sch.id' }, name: 'SMK Negeri 1 Bandung', region_name: 'Kota Bandung', priority: 1 }),
      target('ambiguous', { target_id: 'cf_bcd234efg5', company_id: COMPANY_2, candidates }),
      target('not_found', { target_id: 'cf_cde345fgh6', name: 'SDN 05 Garut', region_name: 'Kab. Garut', priority: 3, hint: {} }),
    ],
    next_cursor: null,
    total_estimate: 1000,
    summary: { counts: { queued: 820, found: 140, ambiguous: 21, not_found: 12, needs_hint: 7 }, eta_seconds: 129_600, paused: { reason: 'captcha', since: AT } },
  }),
  invalid('cf_target_bad_status', 'cf_target_list', { items: [target('lost')], next_cursor: null, total_estimate: 1, summary: { counts: {}, eta_seconds: null, paused: null } }, 'items.0.status'),
  valid('cf_target', 'cf_target', target('found', { found: { website: 'smaharapan.sch.id', phone: null, email_generic: 'tu@smaharapan.sch.id' }, candidates })),
  valid('cf_target_update_input', 'cf_target_update_input', { workspace_id: WS, target_id: 'cf_bcd234efg5', select_candidate_id: 'cc_abc123def4', updated_by: USER }),
  invalid('cf_target_update_empty', 'cf_target_update_input', { workspace_id: WS, target_id: 'cf_bcd234efg5', updated_by: USER }, 'target_id'),
  invalid('cf_target_priority_range', 'cf_target_update_input', { workspace_id: WS, target_id: 'cf_bcd234efg5', priority: 9, updated_by: USER }, 'priority'),
  // Knowledge
  valid('kn_search', 'kn_search', {
    results: [{ chunk_id: 'kh_abc123def4', text: 'Hook yang baik membuat pembaca berhenti menggulir…', citation: { asset_id: 'ka_abc123def4', book_title: 'Buku Marketing', page: 87, chapter: 'Bab 4 — Konten' }, score: 0.83 }],
  }),
  invalid('kn_search_text_too_long', 'kn_search', { results: [{ chunk_id: 'kh_abc123def4', text: 'x'.repeat(601), citation: { asset_id: 'ka_abc123def4', book_title: 'B', page: 1, chapter: null }, score: 0.5 }] }, 'results.0.text'),
  valid('kn_card_list', 'kn_card_list', { items: [card, { ...card, card_id: 'kc_bcd234efg5', card_type: 'anti_pattern', title: 'Terlalu banyak CTA', status: 'approved' }], next_cursor: null, total_estimate: 2 }),
  invalid('kn_card_bad_type', 'kn_card_list', { items: [{ ...card, card_type: 'gossip' }], next_cursor: null, total_estimate: 1 }, 'items.0.card_type'),
  valid('kn_card_decide_input', 'kn_card_decide_input', { workspace_id: WS, card_ids: ['kc_abc123def4', 'kc_bcd234efg5'], decision: 'approve', decided_by: USER }),
  invalid('kn_card_decide_too_many', 'kn_card_decide_input', { workspace_id: WS, card_ids: Array.from({ length: 101 }, (_, i) => `kc_${String(i).padStart(10, '0')}`), decision: 'approve', decided_by: USER }, 'card_ids'),
  valid('kn_card_decision', 'kn_card_decision', { updated: 2, status: 'approved' }),
  valid('knowledge_card', 'knowledge_card', { ...card, version: 2, body: 'AIDA (diedit): mulai dengan perhatian.' }),
  valid('doctrine', 'doctrine', {
    role: 'creative',
    active: doctrineVersion(1, true),
    pending: doctrineVersion(2, false),
    history: [
      { version: 2, status: 'pending', created_at: AT },
      { version: 1, status: 'active', created_at: AT },
    ],
  }),
  invalid('doctrine_bad_role', 'doctrine', { role: 'janitor', active: null, pending: null, history: [] }, 'role'),
  valid('pb_list', 'pb_list', { playbooks: [{ playbook_id: playbook.playbook_id, name: playbook.name, role: playbook.role, version: playbook.version, updated_at: AT, last_run_at: null }] }),
  valid('playbook', 'playbook', playbook),
  invalid('pb_save_empty_yaml', 'pb_save_input', { workspace_id: WS, playbook_id: 'pb_abc123def4', base_version: 2, yaml: '', saved_by: USER }, 'yaml'),
  valid('pb_run', 'pb_run', { run_id: 'pr_bcd234efg5', status: 'queued' }),
  valid('kg_graph', 'kg_graph', graph),
  invalid('kg_edge_no_provenance', 'kg_graph', { ...graph, edges: [{ edge_id: 'ke_000000001a', source: 'kn_aida000001', target: 'kn_hook000001', relation: 'memuat' }] }, 'edges.0.provenance'),
  valid('kg_neighbors', 'kg_neighbors', { ...graph, node: graph.nodes[0], sources: [{ asset_id: 'ka_abc123def4', book_title: 'Buku Marketing', page: 42, chapter: 'Bab 2' }] }),
];
