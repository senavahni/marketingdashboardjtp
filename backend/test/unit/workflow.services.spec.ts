/**
 * DSH-V1-06/09 — ImportService & KnowledgeService dengan IntelMcpClient sungguhan terhadap mock MCP 1.3.
 * Fokus: izin per aksi, pengaman rollback, keputusan massal kartu, alur doktrin & playbook.
 */
import { ZodError } from 'zod';
import { AppException } from '../../src/common/exceptions/app.exception';
import { IntelMcpClient } from '../../src/modules/intel/intel-mcp-client.service';
import { ImportService } from '../../src/modules/market-intel/import.service';
import { KnowledgeService } from '../../src/modules/market-intel/knowledge.service';
import { MockMcp13, startMockMcp13 } from '../../src/scripts/mock-mcp-13';

const KEY = 'mcpk_test0004_' + 'd'.repeat(43);
const WS = '00000000-0000-4000-8000-000000000001';
const user = { id: '00000000-0000-4000-8000-000000000103', username: 'member', display_name: 'Member' };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (err) {
    // ZodError dari service → 400 VALIDATION_ERROR oleh AllExceptionsFilter (lapisan HTTP)
    if (err instanceof ZodError) return 'VALIDATION_ERROR';
    return err instanceof AppException ? err.code : (err as Error).message;
  }
}

describe('Import & Knowledge × mock MCP 1.3', () => {
  let mock: MockMcp13;
  let access: { assertWorkspace: jest.Mock; assertPermission: jest.Mock };
  let imports: ImportService;
  let knowledge: KnowledgeService;
  const uploads = { findFirst: jest.fn() };

  beforeEach(async () => {
    mock = await startMockMcp13({ apiKey: KEY });
    access = { assertWorkspace: jest.fn().mockResolvedValue({ role: 'member' }), assertPermission: jest.fn().mockResolvedValue({ role: 'admin' }) };
    const client = new IntelMcpClient({ env: { MCP_INTEL_API_KEY: KEY, MCP_SERVER_URL: `${mock.url}/mcp` } } as never);
    imports = new ImportService({ upload_refs: uploads } as never, access as never, client);
    knowledge = new KnowledgeService(access as never, client);
  });
  afterEach(() => mock.close());

  it('profil upload: hanya file import milik workspace; izin data:import', async () => {
    uploads.findFirst.mockResolvedValueOnce({ id: 'x' });
    const profile = await imports.profile(user, WS, 'u_abc123def4');
    expect(profile.sheets.map((s) => s.name)).toEqual(['Sekolah', 'Ringkasan']);
    expect(access.assertPermission).toHaveBeenCalledWith(user.id, WS, 'data:import');
    uploads.findFirst.mockResolvedValueOnce(null);
    expect(await codeOf(imports.profile(user, WS, 'u_zzzzzzzzzz'))).toBe('NOT_FOUND');
  });

  it('batch: mapping + field tujuan; baris review → keputusan merge tercatat', async () => {
    const batch = await imports.batch(user, WS, 'ib_abc123def4');
    expect(batch.column_mapping.find((m) => m.source_col === 'Catatan')?.field).toBeNull();
    const rows = await imports.rows(user, WS, 'ib_abc123def4', {});
    expect(rows.items).toHaveLength(1);
    const out = await imports.decideRow(user, WS, 'ib_abc123def4', rows.items[0].row_id, { decision: 'merge', company_id: rows.items[0].candidates[0].company_id });
    expect(out.status).toBe('merged');
    expect((await imports.rows(user, WS, 'ib_abc123def4', {})).items).toHaveLength(0);
    expect(mock.stats.calls.find((c) => c.tool === 'ci_import_row_decide')?.args).toMatchObject({ decided_by: user.id });
  });

  it('merge tanpa company_id ditolak sebelum MCP', async () => {
    expect(await codeOf(imports.decideRow(user, WS, 'ib_abc123def4', 'ir_abc123def4', { decision: 'merge' }))).toBe('VALIDATION_ERROR');
  });

  it('rollback: dry run → dampak; nyata wajib nama file persis', async () => {
    const preview = await imports.rollback(user, WS, 'ib_abc123def4', { dry_run: true });
    expect(preview).toMatchObject({ dry_run: true, kept_in_use: 12 });
    expect(await codeOf(imports.rollback(user, WS, 'ib_abc123def4', { dry_run: false, confirm_filename: 'salah.xlsx' }))).toBe('VALIDATION_ERROR');
    expect(mock.stats.calls.filter((c) => c.tool === 'ci_import_rollback')).toHaveLength(1);
    const done = await imports.rollback(user, WS, 'ib_abc123def4', { dry_run: false, confirm_filename: 'daftar-instansi-jabar.xlsx' });
    expect(done.status).toBe('rolled_back');
    expect(await codeOf(imports.rollback(user, WS, 'ib_abc123def4', { dry_run: false, confirm_filename: 'daftar-instansi-jabar.xlsx' }))).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('Contact Finder: filter status, pilih kandidat → found, hint → queued', async () => {
    const ambiguous = await imports.targets(user, WS, { statuses: 'ambiguous' });
    expect(ambiguous.items.map((t) => t.status)).toEqual(['ambiguous']);
    expect(ambiguous.summary.paused?.reason).toBe('captcha');
    const t = ambiguous.items[0];
    expect((await imports.updateTarget(user, WS, t.target_id, { select_candidate_id: t.candidates[0].candidate_id })).status).toBe('found');
    expect((await imports.updateTarget(user, WS, 'cf_cde345fgh6', { hint: { city: 'Garut' } })).status).toBe('queued');
    expect(await codeOf(imports.updateTarget(user, WS, t.target_id, {}))).toBe('VALIDATION_ERROR');
  });

  it('izin ditolak untuk keputusan → MCP tidak dipanggil', async () => {
    access.assertPermission.mockRejectedValue(new AppException('FORBIDDEN', 'x', 403));
    const before = mock.stats.calls.length;
    expect(await codeOf(imports.decideRow(user, WS, 'ib_abc123def4', 'ir_abc123def4', { decision: 'ignore' }))).toBe('FORBIDDEN');
    expect(await codeOf(knowledge.decideCards(user, WS, { card_ids: ['kc_abc123def4'], decision: 'approve' }))).toBe('FORBIDDEN');
    expect(mock.stats.calls.length).toBe(before);
  });

  it('kartu: approve massal (keputusan PO #4) dengan izin knowledge:approve', async () => {
    const out = await knowledge.decideCards(user, WS, { card_ids: ['kc_abc123def4', 'kc_bcd234efg5'], decision: 'approve' });
    expect(out).toEqual({ updated: 2, status: 'approved' });
    expect(access.assertPermission).toHaveBeenCalledWith(user.id, WS, 'knowledge:approve');
    expect((await knowledge.cards(user, WS, { status: 'draft' })).items).toHaveLength(0);
  });

  it('doktrin: approve versi pending → menjadi aktif', async () => {
    const before = await knowledge.doctrine(user, WS, 'creative');
    expect(before.pending?.version).toBe(2);
    const after = await knowledge.decideDoctrine(user, WS, 'creative', { version: 2, decision: 'approve' });
    expect(after.active?.version).toBe(2);
    expect(after.pending).toBeNull();
  });

  it('playbook: simpan = versi baru; jalankan cukup member', async () => {
    const saved = await knowledge.savePlaybook(user, WS, 'pb_abc123def4', { base_version: 2, yaml: 'name: x\nsteps: []\n' });
    expect(saved.version).toBe(3);
    const run = await knowledge.runPlaybook(user, WS, 'pb_abc123def4');
    expect(run.status).toBe('queued');
    expect(access.assertWorkspace).toHaveBeenCalledWith(user.id, WS, 'member');
  });

  it('KG: setiap edge membawa provenance; tetangga + sumber', async () => {
    const graph = await knowledge.graph(user, WS, { types: 'framework,concept' });
    expect(graph.edges.every((e) => e.provenance.book_title || e.provenance.source_url)).toBe(true);
    const nb = await knowledge.neighbors(user, WS, 'kn_aida000001', {});
    expect(nb.sources[0].page).toBe(42);
  });
});
