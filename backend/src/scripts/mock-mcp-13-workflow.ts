/**
 * Tool mock MCP 1.3 untuk Import/Contact Finder, Knowledge Library, dan daftar agent (DSH-V1-04/06/09).
 * Stateful per instance mock (keputusan kartu, doktrin, target, playbook tersimpan di memori) agar UI dapat
 * didemokan tanpa MCP asli; respons awal = fixture valid `contracts/1.3/`.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ZodType } from 'zod';
import {
  McpToolImport,
  cfTargetUpdateInputSchema,
  cfTargetsInputSchema,
  ciImportBatchGetInputSchema,
  ciImportBatchesInputSchema,
  ciImportRollbackInputSchema,
  ciImportRowDecideInputSchema,
  ciImportRowsInputSchema,
  ciUploadProfileInputSchema,
} from '../shared/schemas/intel-1.3-import.schema';
import {
  McpToolKnowledge,
  kgNeighborsInputSchema,
  kgSearchInputSchema,
  knCardDecideInputSchema,
  knCardUpdateInputSchema,
  knCardsInputSchema,
  knDoctrineDecideInputSchema,
  knDoctrineGetInputSchema,
  knSearchInputSchema,
  pbGetInputSchema,
  pbListInputSchema,
  pbRunInputSchema,
  pbSaveInputSchema,
} from '../shared/schemas/intel-1.3-knowledge.schema';
import { z } from 'zod';

type Payload = Record<string, unknown>;
export interface WorkflowToolDef {
  input: ZodType;
  output: (args: Payload) => Payload;
}

const FIXTURES = resolve(__dirname, '../../../contracts/1.3/fixtures');
const fixture = (name: string): Payload => (JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as { payload: Payload }).payload;
const id = (prefix: string) => `${prefix}_${randomBytes(5).toString('hex')}`;
const now = () => new Date().toISOString();

const AGENTS = [
  ['researcher', 'Researcher', 'smart', ['collect', 'analyze', 'index'], ['social', 'web', 'trends', 'kb', 'mi']],
  ['analyst', 'Analyst', 'smart', ['analyze', 'index', 'analyze_product'], ['analysis', 'kb', 'mi', 'opp', 'pb', 'kn']],
  ['strategist', 'Strategist', 'smart', ['index', 'strategize'], ['kb', 'st', 'pb', 'kn', 'task']],
  ['creative', 'Creative', 'creative', ['create_content'], ['ct', 'kn', 'kb', 'pb']],
  ['curator', 'Curator', 'smart', ['extract_knowledge'], ['kn', 'kg', 'kb']],
  ['prospector', 'Prospector', 'extract', ['discover', 'enrich', 'import_map', 'find_contacts'], ['ci', 'web', 'job']],
] as const;

const passthrough = z.strictObject({});

/** Satu set tool + state baru per instance mock. */
export function createWorkflowTools(): Record<McpToolImport | McpToolKnowledge | 'intel_agents_list', WorkflowToolDef> {
  const cards = new Map((fixture('valid_kn_card_list').items as Payload[]).map((c) => [String(c.card_id), { ...c }]));
  const targets = new Map((fixture('valid_cf_target_list').items as Payload[]).map((t) => [String(t.target_id), { ...t }]));
  const rows = new Map((fixture('valid_import_row_list').items as Payload[]).map((r) => [String(r.row_id), { ...r }]));
  let doctrine = fixture('valid_doctrine');
  let playbook = fixture('valid_playbook');
  let batchRolledBack: string | null = null;
  const batch = (): Payload => ({ ...fixture('valid_import_batch_detail'), ...(batchRolledBack ? { status: 'rolled_back', rolled_back_at: batchRolledBack } : {}) });

  return {
    intel_agents_list: {
      input: passthrough,
      output: () => ({
        agents: AGENTS.map(([agent_key, display_name, route, capabilities, toolsets]) => ({
          agent_key,
          display_name,
          is_active: true,
          route,
          run_token_budget: 80_000,
          toolsets: [...toolsets],
          capabilities: [...capabilities],
          gateway_key: { source: 'agent', prefix: `lgw_${agent_key.slice(0, 8).padEnd(8, '0')}` },
        })),
      }),
    },
    // ---------------------------------------------------------------- import
    ci_upload_profile: { input: ciUploadProfileInputSchema, output: (a) => ({ ...fixture('valid_upload_profile'), upload_id: a.upload_id }) },
    ci_import_batches: {
      input: ciImportBatchesInputSchema,
      output: () => {
        const { column_mapping: _m, fields: _f, ...summary } = batch();
        return { items: [summary], next_cursor: null, total_estimate: 1 };
      },
    },
    ci_import_batch_get: { input: ciImportBatchGetInputSchema, output: (a) => ({ ...batch(), batch_id: a.batch_id }) },
    ci_import_rows: { input: ciImportRowsInputSchema, output: () => ({ items: [...rows.values()].filter((r) => r.status === 'review'), next_cursor: null, total_estimate: rows.size }) },
    ci_import_row_decide: {
      input: ciImportRowDecideInputSchema,
      output: (a) => {
        const status = a.decision === 'merge' ? 'merged' : a.decision === 'new' ? 'inserted' : 'ignored';
        rows.set(String(a.row_id), { ...(rows.get(String(a.row_id)) ?? {}), status });
        return { row_id: a.row_id, status };
      },
    },
    ci_import_rollback: {
      input: ciImportRollbackInputSchema,
      output: (a) => {
        if (a.dry_run) return fixture('valid_import_rollback_preview');
        batchRolledBack = now();
        return fixture('valid_import_rollback_done');
      },
    },
    cf_targets: {
      input: cfTargetsInputSchema,
      output: (a) => {
        const statuses = ((a.filter as { statuses?: string[] } | undefined)?.statuses ?? []) as string[];
        const items = [...targets.values()].filter((t) => !statuses.length || statuses.includes(String(t.status)));
        return { ...fixture('valid_cf_target_list'), items };
      },
    },
    cf_target_update: {
      input: cfTargetUpdateInputSchema,
      output: (a) => {
        const current = targets.get(String(a.target_id)) ?? { ...fixture('valid_cf_target'), target_id: a.target_id };
        const selected = (current.candidates as Payload[] | undefined)?.find((c) => c.candidate_id === a.select_candidate_id);
        const next: Payload = {
          ...current,
          ...(a.priority !== undefined ? { priority: a.priority } : {}),
          ...(a.hint !== undefined ? { hint: a.hint, status: 'queued' } : {}),
          ...(a.rerun ? { status: 'queued', attempts: Number(current.attempts) + 1 } : {}),
          ...(selected ? { status: 'found', candidates: [], found: { website: selected.domain, phone: null, email_generic: null } } : {}),
        };
        targets.set(String(a.target_id), next);
        return next;
      },
    },
    // ---------------------------------------------------------------- knowledge
    kn_search: { input: knSearchInputSchema, output: () => fixture('valid_kn_search') },
    kn_cards: {
      input: knCardsInputSchema,
      output: (a) => {
        const f = (a.filter ?? {}) as { status?: string | null; card_type?: string | null };
        const items = [...cards.values()].filter((c) => (!f.status || c.status === f.status) && (!f.card_type || c.card_type === f.card_type));
        return { items, next_cursor: null, total_estimate: items.length };
      },
    },
    kn_card_decide: {
      input: knCardDecideInputSchema,
      output: (a) => {
        const status = a.decision === 'approve' ? 'approved' : 'rejected';
        const ids = a.card_ids as string[];
        ids.forEach((cid) => cards.has(cid) && cards.set(cid, { ...cards.get(cid), status }));
        return { updated: ids.filter((cid) => cards.has(cid)).length, status };
      },
    },
    kn_card_update: {
      input: knCardUpdateInputSchema,
      output: (a) => {
        const current = cards.get(String(a.card_id)) ?? fixture('valid_knowledge_card');
        const next = { ...current, ...(a.title ? { title: a.title } : {}), ...(a.body ? { body: a.body } : {}), ...(a.roles ? { roles: a.roles } : {}), version: Number(current.version) + 1, status: 'draft' };
        cards.set(String(a.card_id), next);
        return next;
      },
    },
    kn_doctrine_get: { input: knDoctrineGetInputSchema, output: (a) => ({ ...doctrine, role: a.role }) },
    kn_doctrine_decide: {
      input: knDoctrineDecideInputSchema,
      output: (a) => {
        const pending = doctrine.pending as Payload | null;
        if (pending && pending.version === a.version) {
          doctrine = a.decision === 'approve' ? { ...doctrine, active: { ...pending, approved_at: now() }, pending: null } : { ...doctrine, pending: null };
        }
        return { ...doctrine, role: a.role };
      },
    },
    pb_list: { input: pbListInputSchema, output: () => ({ playbooks: [{ playbook_id: playbook.playbook_id, name: playbook.name, role: playbook.role, version: playbook.version, updated_at: playbook.updated_at, last_run_at: playbook.last_run_at }] }) },
    pb_get: { input: pbGetInputSchema, output: () => playbook },
    pb_save: {
      input: pbSaveInputSchema,
      output: (a) => {
        const version = Number(playbook.version) + 1;
        playbook = { ...playbook, yaml: a.yaml, version, updated_at: now(), versions: [{ version, created_at: now(), created_by: 'Dashboard' }, ...(playbook.versions as Payload[])] };
        return playbook;
      },
    },
    pb_run: {
      input: pbRunInputSchema,
      output: () => {
        const run = { run_id: id('pr'), status: 'queued' };
        playbook = { ...playbook, last_run_at: now(), runs: [{ ...run, started_at: now(), finished_at: null }, ...(playbook.runs as Payload[])] };
        return run;
      },
    },
    kg_search: { input: kgSearchInputSchema, output: () => fixture('valid_kg_graph') },
    kg_neighbors: { input: kgNeighborsInputSchema, output: () => fixture('valid_kg_neighbors') },
  };
}
