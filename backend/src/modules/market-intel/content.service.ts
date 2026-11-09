import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { content_items } from '../../generated/prisma/client';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskInput } from '../tasks/tasks.schemas';
import {
  assertContentAction,
  bulkContentDecisionSchema,
  contentDecisionSchema,
  contentQuerySchema,
  publishContentSchema,
  scheduleContentSchema,
  strategiesQuerySchema,
  updateContentSchema,
} from './content.schemas';

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', x: 'X', threads: 'Threads' };

/** AI Strategy Studio & Bank Konten — sisi Dashboard (DSH-V1-02): strategi, item konten, kalender, jadwal → task. */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly tasks: TasksService,
  ) {}

  async strategies(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = strategiesQuerySchema.parse(raw);
    const offset = decodeCursor(q.cursor);
    const rows = await this.prisma.strategy_docs.findMany({
      where: { workspace_id: workspaceId, deleted_at: null, ...(q.product_id ? { product_id: q.product_id } : {}), ...(q.status ? { status: q.status } : {}) },
      include: { _count: { select: { content_items: { where: { deleted_at: null } } } } },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: q.limit + 1,
    });
    return toPage(
      rows.map(({ _count, ...s }) => ({ ...s, content_count: _count.content_items })),
      offset,
      q.limit,
    );
  }

  async list(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const q = contentQuerySchema.parse(raw);
    const offset = decodeCursor(q.cursor);
    const rows = await this.prisma.content_items.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        ...(q.strategy_doc_id ? { strategy_doc_id: q.strategy_doc_id } : {}),
        ...(q.status?.length ? { status: { in: q.status } } : {}),
        ...(q.platform?.length ? { platform: { in: q.platform } } : {}),
        ...(q.pillar ? { pillar: q.pillar } : {}),
        ...(q.from || q.to ? { scheduled_at: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: [{ scheduled_at: 'asc' }, { created_at: 'asc' }],
      skip: offset,
      take: q.limit + 1,
    });
    return toPage(rows, offset, q.limit);
  }

  /** Edit inline: versi naik; konten approved yang diedit kembali ke draft (perlu approve ulang). */
  async update(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const { version, ...changes } = updateContentSchema.parse(raw);
    const item = await this.find(workspaceId, id);
    assertContentAction('edit', item.status);
    const res = await this.prisma.content_items.updateMany({
      where: { id, version },
      data: { ...changes, version: { increment: 1 }, edited_by: user.id, status: item.status === 'approved' ? 'draft' : item.status },
    });
    if (!res.count) throw Errors.conflict(ErrorCode.VERSION_CONFLICT, 'Konten sudah diubah orang lain; muat ulang', { current_version: item.version });
    return this.find(workspaceId, id);
  }

  async decide(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    const input = contentDecisionSchema.parse(raw);
    return this.decideMany(user, workspaceId, { ...input, ids: [id] }).then((r) => r.data[0]);
  }

  async decideMany(user: AuthUser, workspaceId: string, raw: unknown) {
    await this.access.assertPermission(user.id, workspaceId, 'content:approve');
    const { ids, decision } = bulkContentDecisionSchema.parse(raw);
    const items = await this.prisma.content_items.findMany({ where: { id: { in: ids }, workspace_id: workspaceId, deleted_at: null } });
    if (items.length !== new Set(ids).size) throw Errors.notFound('Sebagian konten tidak ditemukan');
    items.forEach((item) => assertContentAction('decide', item.status));
    await this.prisma.content_items.updateMany({ where: { id: { in: ids } }, data: { status: decision === 'approve' ? 'approved' : 'rejected' } });
    return { data: await this.prisma.content_items.findMany({ where: { id: { in: ids } } }) };
  }

  /** Jadwalkan konten approved → task Penjadwalan (Modul 1) untuk PIC + marketing_actions. */
  async schedule(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const input = scheduleContentSchema.parse(raw);
    const item = await this.find(workspaceId, id);
    assertContentAction('schedule', item.status);
    const project = await this.prisma.projects.findFirst({ where: { id: input.project_id, workspace_id: workspaceId, deleted_at: null }, select: { id: true } });
    if (!project) throw Errors.validation('Project tidak ditemukan di workspace ini', { field: 'project_id' });
    const day = input.scheduled_at.slice(0, 10);
    const taskInput: CreateTaskInput = {
      title: `[${PLATFORM_LABEL[item.platform]}] ${item.hook}`.slice(0, 500),
      start_date: day,
      end_date: day,
      tags: ['konten', item.platform],
      ...(input.assignee_user_id ? { assignee: { type: 'user', id: input.assignee_user_id } } : {}),
    };
    const task = await this.tasks.create(user, project.id, null, taskInput, null);
    if (!task) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Task penjadwalan gagal dibuat');
    return this.prisma.tx(async (tx) => {
      const updated = await tx.content_items.update({ where: { id }, data: { status: 'scheduled', scheduled_at: new Date(input.scheduled_at), task_id: task.id } });
      await tx.marketing_actions.create({
        data: { workspace_id: workspaceId, strategy_doc_id: item.strategy_doc_id, content_item_id: id, title: `Publikasi ${PLATFORM_LABEL[item.platform]}`, channel: item.platform, task_id: task.id, created_by: user.id },
      });
      return updated;
    });
  }

  async publish(user: AuthUser, workspaceId: string, id: string, raw: unknown) {
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const { published_url } = publishContentSchema.parse(raw);
    const item = await this.find(workspaceId, id);
    assertContentAction('publish', item.status);
    return this.prisma.tx(async (tx) => {
      await tx.marketing_actions.updateMany({ where: { content_item_id: id, status: { in: ['planned', 'in_progress'] } }, data: { status: 'done', result: published_url } });
      return tx.content_items.update({ where: { id }, data: { status: 'published', published_url } });
    });
  }

  private async find(workspaceId: string, id: string): Promise<content_items> {
    const item = await this.prisma.content_items.findFirst({ where: { id, workspace_id: workspaceId, deleted_at: null } });
    if (!item) throw Errors.notFound('Konten tidak ditemukan');
    return item;
  }
}
