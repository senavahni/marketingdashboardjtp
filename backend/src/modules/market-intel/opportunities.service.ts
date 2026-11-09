import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { Prisma, opportunities } from '../../generated/prisma/client';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import {
  assertOpportunityTransition,
  createOpportunitySchema,
  opportunitiesQuerySchema,
  opportunityNoteSchema,
  updateOpportunitySchema,
} from './opportunities.schemas';

/** Opportunity workflow + riwayat `opportunity_events` (DSH-V1-02). */
@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = opportunitiesQuerySchema.parse(raw);
    const offset = decodeCursor(q.cursor);
    const rows = await this.prisma.opportunities.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        ...(q.status ? { status: q.status } : {}),
        ...(q.product_id ? { product_id: q.product_id } : {}),
        ...(q.owner_user_id ? { owner_user_id: q.owner_user_id } : {}),
      },
      orderBy: [{ updated_at: 'desc' }],
      skip: offset,
      take: q.limit + 1,
    });
    return toPage(rows.map(toDto), offset, q.limit);
  }

  async create(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertPermission(user.id, workspaceId, 'opportunities:write');
    const input = createOpportunitySchema.parse(raw);
    const product = await this.prisma.products.findFirst({ where: { id: input.product_id, workspace_id: workspaceId, deleted_at: null } });
    if (!product) throw Errors.validation('Produk tidak ditemukan di workspace ini', { field: 'product_id' });
    if (input.owner_user_id) await this.assertMember(workspaceId, input.owner_user_id);
    try {
      const row = await this.prisma.tx(async (tx) => {
        const opp = await tx.opportunities.create({
          data: {
            workspace_id: workspaceId,
            product_id: input.product_id,
            mcp_company_id: input.mcp_company_id,
            company_name_cache: input.company_name,
            latest_score: input.latest_score ?? null,
            priority: input.priority ?? null,
            score_model_version: input.score_model_version ?? null,
            owner_user_id: input.owner_user_id ?? null,
            notes: input.notes ?? null,
            created_by: user.id,
          },
        });
        await this.event(tx, opp.id, user, 'created', { to: 'new', payload: { latest_score: input.latest_score ?? null } });
        return opp;
      });
      return toDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict(ErrorCode.ALREADY_EXISTS, 'Perusahaan ini sudah menjadi opportunity untuk produk tersebut');
      }
      throw error;
    }
  }

  async update(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    await this.access.assertPermission(user.id, workspaceId, 'opportunities:write');
    const input = updateOpportunitySchema.parse(raw);
    const current = await this.find(workspaceId, id);
    if (input.status) assertOpportunityTransition(current.status, input.status);
    if (input.owner_user_id) await this.assertMember(workspaceId, input.owner_user_id);
    const row = await this.prisma.tx(async (tx) => {
      const updated = await tx.opportunities.update({
        where: { id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.owner_user_id !== undefined ? { owner_user_id: input.owner_user_id } : {}),
          ...(input.next_action_at !== undefined ? { next_action_at: input.next_action_at ? new Date(input.next_action_at) : null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      if (input.status) await this.event(tx, id, user, 'status_changed', { from: current.status, to: input.status, payload: { reason: input.reason ?? null } });
      if (input.owner_user_id !== undefined && input.owner_user_id !== current.owner_user_id) {
        await this.event(tx, id, user, 'owner_changed', { payload: { from: current.owner_user_id, to: input.owner_user_id } });
      }
      return updated;
    });
    return toDto(row);
  }

  async addNote(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    await this.access.assertPermission(user.id, workspaceId, 'opportunities:write');
    const { note } = opportunityNoteSchema.parse(raw);
    await this.find(workspaceId, id);
    await this.prisma.tx((tx) => this.event(tx, id, user, 'note', { payload: { note } }));
    return this.events(user, workspaceId, id);
  }

  async events(user: AuthUser, workspaceId: string, id: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    await this.find(workspaceId, id);
    const rows = await this.prisma.opportunity_events.findMany({ where: { opportunity_id: id }, orderBy: { created_at: 'desc' }, take: 200 });
    return { data: rows };
  }

  private event(tx: Tx, opportunityId: string, user: AuthUser, type: string, e: { from?: opportunities['status']; to?: opportunities['status']; payload?: Record<string, unknown> }) {
    return tx.opportunity_events.create({
      data: { opportunity_id: opportunityId, event_type: type, from_status: e.from ?? null, to_status: e.to ?? null, payload: (e.payload ?? {}) as Prisma.InputJsonValue, actor_type: 'user', actor_id: user.id },
    });
  }

  private async find(workspaceId: string, id: string): Promise<opportunities> {
    const row = await this.prisma.opportunities.findFirst({ where: { id, workspace_id: workspaceId, deleted_at: null } });
    if (!row) throw Errors.notFound('Opportunity tidak ditemukan');
    return row;
  }

  private async assertMember(workspaceId: string, userId: string): Promise<void> {
    const member = await this.prisma.workspace_members.findUnique({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } } });
    if (!member) throw Errors.validation('Pemilik opportunity harus anggota workspace', { field: 'owner_user_id' });
  }
}

function toDto(o: opportunities) {
  return {
    id: o.id,
    product_id: o.product_id,
    mcp_company_id: o.mcp_company_id,
    company_name: o.company_name_cache,
    latest_score: o.latest_score ? Number(o.latest_score) : null,
    priority: o.priority,
    score_model_version: o.score_model_version,
    status: o.status,
    owner_user_id: o.owner_user_id,
    next_action_at: o.next_action_at,
    notes: o.notes,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}
