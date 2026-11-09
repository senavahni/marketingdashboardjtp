import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ZodType } from 'zod';
import { can } from '../../common/constants/permissions';
import { AuthUser } from '../../common/types/request.types';
import { RedisService } from '../../redis/redis.service';
import { workspace_role } from '../../generated/prisma/client';
import {
  CompanyProfile,
  McpTool13,
  ciCompanyListSchema,
  companyProfileSchema,
  geoClustersSchema,
  knAssetListSchema,
  miKpisSchema,
  oppExplainSchema,
  oppListSchema,
} from '../../shared/schemas/intel-1.3-tools.schema';
import { AccessService } from '../core/access.service';
import { IntelMcpClient } from '../intel/intel-mcp-client.service';
import {
  companiesQuerySchema,
  geoClustersQuerySchema,
  knAssetsQuerySchema,
  kpisQuerySchema,
  oppExplainQuerySchema,
  oppScoresQuerySchema,
  toCompanyFilter,
} from './intel-proxy.schemas';

/** TTL cache per layar (detik): KPI & penjelasan skor jarang berubah; daftar lebih sering. */
const TTL = { kpis: 300, list: 60, profile: 120, geo: 120, explain: 300, assets: 60 } as const;

/**
 * Proxy tipis per layar ke toolset MCP 1.3 dengan cache Redis (DSH-V1-02). Data mesin tidak disimpan di DB
 * Dashboard (V1-K3). Kontak personal disaring SETELAH cache sesuai izin peminta (`contacts:view_personal`).
 */
@Injectable()
export class IntelProxyService {
  private readonly logger = new Logger(IntelProxyService.name);

  constructor(
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
    private readonly redis: RedisService,
  ) {}

  async kpis(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = kpisQuerySchema.parse(raw);
    const args = { workspace_id: workspaceId, period: { since: q.since, until: q.until }, compare: q.compare === 'none' ? null : q.compare };
    return this.cached('mi_kpis', args, miKpisSchema, TTL.kpis, requestId);
  }

  async companies(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = companiesQuerySchema.parse(raw);
    const args = { workspace_id: workspaceId, filter: toCompanyFilter(q), order_by: q.order_by, limit: q.limit, cursor: q.cursor ?? null };
    return this.cached('ci_company_list', args, ciCompanyListSchema, TTL.list, requestId);
  }

  async company(user: AuthUser, workspaceId: string, companyId: string, requestId?: string) {
    const { role } = await this.access.assertWorkspace(user.id, workspaceId);
    const profile = await this.cached('ci_company_get', { workspace_id: workspaceId, company_id: companyId }, companyProfileSchema, TTL.profile, requestId);
    return filterContacts(profile, role);
  }

  async geoClusters(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = geoClustersQuerySchema.parse(raw);
    const args = { workspace_id: workspaceId, bbox: q.bbox, zoom: q.zoom, filter: toCompanyFilter(q) };
    return this.cached('ci_geo_clusters', args, geoClustersSchema, TTL.geo, requestId);
  }

  async oppScores(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = oppScoresQuerySchema.parse(raw);
    const args = {
      workspace_id: workspaceId,
      filter: {
        product_id: q.product_id ?? null,
        priorities: q.priorities ?? [],
        kbli_codes: q.kbli_codes ?? [],
        region_codes: q.region_codes ?? [],
        org_types: q.org_types ?? [],
        insufficient_data: q.insufficient_data ?? null,
      },
      order_by: q.order_by,
      limit: q.limit,
      cursor: q.cursor ?? null,
    };
    return this.cached('opp_list', args, oppListSchema, TTL.list, requestId);
  }

  async oppExplain(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = oppExplainQuerySchema.parse(raw);
    return this.cached('opp_explain', { workspace_id: workspaceId, ...q, score_model_version: q.score_model_version ?? null }, oppExplainSchema, TTL.explain, requestId);
  }

  async knAssets(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = knAssetsQuerySchema.parse(raw);
    return this.cached('kn_asset_list', { workspace_id: workspaceId, kind: q.kind ?? null, limit: q.limit, cursor: q.cursor ?? null }, knAssetListSchema, TTL.assets, requestId);
  }

  /** Cache key = tool + hash argumen (workspace_id ikut di argumen → terisolasi per workspace). */
  private async cached<T>(tool: McpTool13, args: Record<string, unknown>, schema: ZodType<T>, ttl: number, requestId?: string): Promise<T> {
    const key = `mi:${tool}:${createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 32)}`;
    try {
      const hit = await this.redis.client.get(key);
      if (hit) {
        const parsed = schema.safeParse(JSON.parse(hit));
        if (parsed.success) return parsed.data;
      }
    } catch (error) {
      this.logger.debug({ key, error: (error as Error).message }, 'Cache intel proxy tidak dapat dibaca');
    }
    const result = await this.mcp.call(tool, args, schema, requestId);
    await this.redis.client.set(key, JSON.stringify(result), 'EX', ttl).catch((error: Error) => this.logger.debug({ key, error: error.message }, 'Cache intel proxy tidak dapat ditulis'));
    return result;
  }
}

/**
 * Kontak suppressed selalu dibuang. Kontak personal hanya untuk peran ber-izin `contacts:view_personal`;
 * selain itu hanya jumlahnya yang dilaporkan (UI menampilkan "N kontak personal tersembunyi").
 */
export function filterContacts(profile: CompanyProfile, role: workspace_role): CompanyProfile & { hidden_personal_contacts: number } {
  const visible = profile.contacts.filter((c) => !c.suppressed);
  const allowed = can(role, 'contacts:view_personal');
  const contacts = allowed ? visible : visible.filter((c) => c.contact_type !== 'personal');
  return { ...profile, contacts, hidden_personal_contacts: visible.length - contacts.length };
}
