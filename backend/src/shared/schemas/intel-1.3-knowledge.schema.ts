import { z } from 'zod';
import { uuid } from './common.schema';
import { mcpRef, pageInputShape, pageOf } from './intel-1.3.schema';

/**
 * Kontrak 1.3 (aditif, DSH-V1-09 / MCP-V1-11..13) — Knowledge Library: pencarian buku, knowledge card,
 * doktrin per peran, playbook, dan knowledge graph. Semua data milik MCP; Dashboard membaca & mengirim keputusan manusia.
 */

export const MCP_TOOLS_13_KNOWLEDGE = [
  'kn_search',
  'kn_cards',
  'kn_card_decide',
  'kn_card_update',
  'kn_doctrine_get',
  'kn_doctrine_decide',
  'pb_list',
  'pb_get',
  'pb_save',
  'pb_run',
  'kg_search',
  'kg_neighbors',
] as const;
export type McpToolKnowledge = (typeof MCP_TOOLS_13_KNOWLEDGE)[number];

export const CARD_TYPES = ['framework', 'persuasion', 'copy_formula', 'content_format', 'channel_tactic', 'kpi', 'anti_pattern'] as const;
export const DOCTRINE_ROLES = ['analyst', 'strategist', 'creative'] as const;
export const KG_NODE_TYPES = ['concept', 'framework', 'company', 'segment', 'theme', 'product', 'book'] as const;
export const KG_LIMITS = { nodesMax: 500, searchResultsMax: 20, chunkMaxChars: 600, playbookMaxChars: 20_000 } as const;

const awareDatetime = z.iso.datetime({ offset: true });
const ws = { workspace_id: uuid };
const citationSchema = z.object({ asset_id: mcpRef, book_title: z.string().max(200), page: z.number().int().min(1), chapter: z.string().max(200).nullable() });
export type Citation = z.infer<typeof citationSchema>;

// ---------------------------------------------------------------------------- pencarian buku

export const knSearchInputSchema = z.strictObject({
  ...ws,
  query: z.string().trim().min(2).max(300),
  asset_ids: z.array(mcpRef).max(20).default([]),
  limit: z.number().int().min(1).max(KG_LIMITS.searchResultsMax).default(10),
});
export const knSearchSchema = z.object({
  results: z.array(z.object({ chunk_id: mcpRef, text: z.string().max(KG_LIMITS.chunkMaxChars), citation: citationSchema, score: z.number().min(0).max(1) })).max(KG_LIMITS.searchResultsMax),
});

// ---------------------------------------------------------------------------- knowledge card

export const knowledgeCardSchema = z.object({
  card_id: mcpRef,
  asset_id: mcpRef,
  book_title: z.string().max(200),
  card_type: z.enum(CARD_TYPES),
  title: z.string().max(200),
  body: z.string().max(2_000),
  page_from: z.number().int().min(1),
  page_to: z.number().int().min(1),
  roles: z.array(z.enum(DOCTRINE_ROLES)).max(3),
  status: z.enum(['draft', 'approved', 'rejected']),
  version: z.number().int().min(1),
});
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;

export const knCardsInputSchema = z.strictObject({
  ...ws,
  filter: z
    .strictObject({
      asset_id: mcpRef.nullable().optional(),
      card_type: z.enum(CARD_TYPES).nullable().optional(),
      role: z.enum(DOCTRINE_ROLES).nullable().optional(),
      status: z.enum(['draft', 'approved', 'rejected']).nullable().optional(),
    })
    .default({}),
  ...pageInputShape,
});
export const knCardListSchema = pageOf(knowledgeCardSchema);

/** Keputusan massal diizinkan untuk kartu (keputusan PO #4, 10 Nov 2026). */
export const knCardDecideInputSchema = z.strictObject({ ...ws, card_ids: z.array(mcpRef).min(1).max(100), decision: z.enum(['approve', 'reject']), decided_by: uuid });
export const knCardDecisionSchema = z.object({ updated: z.number().int().min(0), status: z.enum(['approved', 'rejected']) });

export const knCardUpdateInputSchema = z.strictObject({
  ...ws,
  card_id: mcpRef,
  version: z.number().int().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(2_000).optional(),
  roles: z.array(z.enum(DOCTRINE_ROLES)).max(3).optional(),
  edited_by: uuid,
});

// ---------------------------------------------------------------------------- doktrin per peran

const doctrineVersionSchema = z.object({
  version: z.number().int().min(1),
  text: z.string().max(12_000),
  tokens: z.number().int().min(0),
  card_ids: z.array(mcpRef).max(200),
  created_at: awareDatetime,
  approved_at: awareDatetime.nullable(),
});
export type DoctrineVersion = z.infer<typeof doctrineVersionSchema>;

export const knDoctrineGetInputSchema = z.strictObject({ ...ws, role: z.enum(DOCTRINE_ROLES) });
export const doctrineSchema = z.object({
  role: z.enum(DOCTRINE_ROLES),
  active: doctrineVersionSchema.nullable(),
  /** Versi baru hasil curator yang menunggu persetujuan manusia (satu per satu, keputusan PO #4). */
  pending: doctrineVersionSchema.nullable(),
  history: z.array(z.object({ version: z.number().int().min(1), status: z.enum(['active', 'superseded', 'rejected', 'pending']), created_at: awareDatetime })).max(50),
});
export type Doctrine = z.infer<typeof doctrineSchema>;

export const knDoctrineDecideInputSchema = z.strictObject({ ...ws, role: z.enum(DOCTRINE_ROLES), version: z.number().int().min(1), decision: z.enum(['approve', 'reject']), decided_by: uuid });

// ---------------------------------------------------------------------------- playbook

const playbookSummarySchema = z.object({
  playbook_id: mcpRef,
  name: z.string().max(150),
  role: z.enum(DOCTRINE_ROLES),
  version: z.number().int().min(1),
  updated_at: awareDatetime,
  last_run_at: awareDatetime.nullable(),
});
export const pbListInputSchema = z.strictObject({ ...ws });
export const pbListSchema = z.object({ playbooks: z.array(playbookSummarySchema).max(200) });

export const pbGetInputSchema = z.strictObject({ ...ws, playbook_id: mcpRef });
export const playbookSchema = playbookSummarySchema.extend({
  yaml: z.string().max(KG_LIMITS.playbookMaxChars),
  versions: z.array(z.object({ version: z.number().int().min(1), created_at: awareDatetime, created_by: z.string().max(100).nullable() })).max(100),
  runs: z.array(z.object({ run_id: mcpRef, status: z.enum(['queued', 'running', 'completed', 'failed']), started_at: awareDatetime, finished_at: awareDatetime.nullable() })).max(50),
});
export type Playbook = z.infer<typeof playbookSchema>;

/** Simpan = versi baru (optimistic: `base_version` harus versi terbaru). MCP memvalidasi YAML. */
export const pbSaveInputSchema = z.strictObject({ ...ws, playbook_id: mcpRef, base_version: z.number().int().min(1), yaml: z.string().min(1).max(KG_LIMITS.playbookMaxChars), saved_by: uuid });
export const pbRunInputSchema = z.strictObject({ ...ws, playbook_id: mcpRef, requested_by: uuid });
export const pbRunSchema = z.object({ run_id: mcpRef, status: z.enum(['queued', 'running']) });

// ---------------------------------------------------------------------------- knowledge graph

export const kgNodeSchema = z.object({ node_id: mcpRef, label: z.string().max(200), type: z.enum(KG_NODE_TYPES), definition: z.string().max(1_000).nullable() });
export const kgEdgeSchema = z.object({
  edge_id: mcpRef,
  source: mcpRef,
  target: mcpRef,
  relation: z.string().max(60),
  /** AC DSH-V1-09: setiap edge menampilkan provenance. */
  provenance: z.object({ card_id: mcpRef.nullable(), book_title: z.string().max(200).nullable(), page: z.number().int().min(1).nullable(), source_url: z.string().max(2_048).nullable() }),
});
export type KgNode = z.infer<typeof kgNodeSchema>;
export type KgEdge = z.infer<typeof kgEdgeSchema>;
export const kgGraphSchema = z.object({ nodes: z.array(kgNodeSchema).max(KG_LIMITS.nodesMax), edges: z.array(kgEdgeSchema).max(KG_LIMITS.nodesMax * 4), truncated: z.boolean() });
export type KgGraph = z.infer<typeof kgGraphSchema>;

export const kgSearchInputSchema = z.strictObject({
  ...ws,
  q: z.string().trim().max(100).nullable().optional(),
  types: z.array(z.enum(KG_NODE_TYPES)).default([]),
  limit: z.number().int().min(1).max(KG_LIMITS.nodesMax).default(200),
});
export const kgNeighborsInputSchema = z.strictObject({ ...ws, node_id: mcpRef, limit: z.number().int().min(1).max(KG_LIMITS.nodesMax).default(50) });
export const kgNeighborsSchema = kgGraphSchema.extend({ node: kgNodeSchema, sources: z.array(citationSchema).max(20) });
