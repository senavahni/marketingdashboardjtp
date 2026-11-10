import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/types/request.types';
import {
  doctrineSchema,
  kgGraphSchema,
  kgNeighborsSchema,
  knCardDecisionSchema,
  knCardListSchema,
  knSearchSchema,
  knowledgeCardSchema,
  pbListSchema,
  pbRunSchema,
  playbookSchema,
} from '../../shared/schemas/intel-1.3-knowledge.schema';
import { AccessService } from '../core/access.service';
import { IntelMcpClient } from '../intel/intel-mcp-client.service';
import {
  cardDecisionSchema,
  cardUpdateSchema,
  doctrineDecisionSchema,
  kgNeighborsQuerySchema,
  kgSearchQuerySchema,
  knCardsQuerySchema,
  knSearchQuerySchema,
  playbookSaveSchema,
} from './workflow.schemas';

type Role = 'analyst' | 'strategist' | 'creative';

/**
 * Knowledge Library (DSH-V1-09): pencarian buku, kartu, doktrin, playbook, KG — proxy ke MCP.
 * Baca = semua anggota; approve/edit kartu & doktrin & playbook = `knowledge:approve`; jalankan playbook = member.
 * Hanya kartu approved yang masuk doktrin (ditegakkan MCP; Dashboard tidak punya jalur lain).
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
  ) {}

  async search(user: AuthUser, ws: string, raw: unknown, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const q = knSearchQuerySchema.parse(raw);
    return this.mcp.call('kn_search', { workspace_id: ws, query: q.q, asset_ids: q.asset_ids ?? [], limit: q.limit }, knSearchSchema, rid);
  }

  async cards(user: AuthUser, ws: string, raw: unknown, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const { limit, cursor, ...f } = knCardsQuerySchema.parse(raw);
    const filter = { asset_id: f.asset_id ?? null, card_type: f.card_type ?? null, role: f.role ?? null, status: f.status ?? null };
    return this.mcp.call('kn_cards', { workspace_id: ws, filter, limit, cursor: cursor ?? null }, knCardListSchema, rid);
  }

  /** Approve/reject kartu — massal diizinkan (keputusan PO #4). */
  async decideCards(user: AuthUser, ws: string, raw: unknown, rid?: string) {
    await this.access.assertPermission(user.id, ws, 'knowledge:approve');
    const input = cardDecisionSchema.parse(raw);
    return this.mcp.call('kn_card_decide', { workspace_id: ws, ...input, decided_by: user.id }, knCardDecisionSchema, rid);
  }

  async updateCard(user: AuthUser, ws: string, cardId: string, raw: unknown, rid?: string) {
    await this.access.assertPermission(user.id, ws, 'knowledge:approve');
    const input = cardUpdateSchema.parse(raw);
    return this.mcp.call('kn_card_update', { workspace_id: ws, card_id: cardId, ...input, edited_by: user.id }, knowledgeCardSchema, rid);
  }

  async doctrine(user: AuthUser, ws: string, role: Role, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    return this.mcp.call('kn_doctrine_get', { workspace_id: ws, role }, doctrineSchema, rid);
  }

  /** Doktrin diputuskan satu per satu (bukan massal). */
  async decideDoctrine(user: AuthUser, ws: string, role: Role, raw: unknown, rid?: string) {
    await this.access.assertPermission(user.id, ws, 'knowledge:approve');
    const input = doctrineDecisionSchema.parse(raw);
    return this.mcp.call('kn_doctrine_decide', { workspace_id: ws, role, ...input, decided_by: user.id }, doctrineSchema, rid);
  }

  async playbooks(user: AuthUser, ws: string, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    return this.mcp.call('pb_list', { workspace_id: ws }, pbListSchema, rid);
  }

  async playbook(user: AuthUser, ws: string, id: string, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    return this.mcp.call('pb_get', { workspace_id: ws, playbook_id: id }, playbookSchema, rid);
  }

  async savePlaybook(user: AuthUser, ws: string, id: string, raw: unknown, rid?: string) {
    await this.access.assertPermission(user.id, ws, 'knowledge:approve');
    const input = playbookSaveSchema.parse(raw);
    return this.mcp.call('pb_save', { workspace_id: ws, playbook_id: id, ...input, saved_by: user.id }, playbookSchema, rid);
  }

  async runPlaybook(user: AuthUser, ws: string, id: string, rid?: string) {
    await this.access.assertWorkspace(user.id, ws, 'member');
    return this.mcp.call('pb_run', { workspace_id: ws, playbook_id: id, requested_by: user.id }, pbRunSchema, rid);
  }

  async graph(user: AuthUser, ws: string, raw: unknown, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const q = kgSearchQuerySchema.parse(raw);
    return this.mcp.call('kg_search', { workspace_id: ws, q: q.q ?? null, types: q.types ?? [], limit: q.limit }, kgGraphSchema, rid);
  }

  async neighbors(user: AuthUser, ws: string, nodeId: string, raw: unknown, rid?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const q = kgNeighborsQuerySchema.parse(raw);
    return this.mcp.call('kg_neighbors', { workspace_id: ws, node_id: nodeId, limit: q.limit }, kgNeighborsSchema, rid);
  }
}
