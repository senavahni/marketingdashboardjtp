import { Injectable } from '@nestjs/common';
import { hasRole } from '../../common/constants/domain';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor, AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { Prisma, workspace_role } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { excerpt } from '../../utils/helpers/text.util';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AccessService } from '../core/access.service';
import { ActorService } from '../core/actor.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateCommentInput, MentionRef, UpdateCommentInput } from './comments.schemas';

export const MENTION_RUNS_PER_HOUR = 10;

export const commentInclude = {
  author_user: { select: { id: true, display_name: true, avatar_url: true } },
  author_agent: { select: { id: true, name: true, avatar_url: true } },
  _count: { select: { replies: { where: { deleted_at: null } } } },
} satisfies Prisma.commentsInclude;
type CommentRow = Prisma.commentsGetPayload<{ include: typeof commentInclude }>;

interface EntityContext {
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  title: string;
  role: workspace_role;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly actors: ActorService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly runs: AgentRunsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(user: AuthUser, entityType: 'project' | 'task' | 'block', entityId: string, limit: number, cursor?: string) {
    await this.resolveEntity(user, entityType, entityId, 'viewer');
    const offset = decodeCursor(cursor);
    const roots = await this.prisma.comments.findMany({
      where: { entity_type: entityType, entity_id: entityId, parent_comment_id: null, deleted_at: null },
      include: { ...commentInclude, replies: { where: { deleted_at: null }, include: commentInclude, orderBy: { created_at: 'asc' }, take: 50 } },
      orderBy: { created_at: 'asc' },
      skip: offset,
      take: limit + 1,
    });
    const page = toPage(roots, offset, limit);
    const all = page.data.flatMap((r) => [r, ...r.replies]);
    const names = await this.mentionNames(all);
    return {
      data: page.data.map((r) => ({ ...this.toDto(r, names), replies: r.replies.map((c) => this.toDto(c, names)) })),
      next_cursor: page.next_cursor,
    };
  }

  async create(user: AuthUser, input: CreateCommentInput, clientId: string | null) {
    const ctx = await this.resolveEntity(user, input.entity_type, input.entity_id, 'member');
    const actor = userActor(user);

    let parentId: string | null = null;
    if (input.parent_comment_id) {
      const parent = await this.prisma.comments.findFirst({
        where: { id: input.parent_comment_id, entity_type: input.entity_type, entity_id: input.entity_id, deleted_at: null },
      });
      if (!parent) throw Errors.validation('parent_comment_id tidak ditemukan pada entity ini', { field: 'parent_comment_id' });
      parentId = parent.parent_comment_id ?? parent.id; // thread hanya 1 level
    }

    const { valid, users, agents } = await this.validateMentions(ctx.workspaceId, input.mentions);
    const warnings: string[] = [];
    const effects = new AfterCommit();

    const comment = await this.prisma.tx(async (tx) => {
      const c = await tx.comments.create({
        data: {
          project_id: ctx.projectId,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          parent_comment_id: parentId,
          author_type: 'user',
          author_user_id: user.id,
          content: input.content,
          mentions: valid as unknown as Prisma.InputJsonValue,
        },
        include: commentInclude,
      });

      await this.activity.log(
        tx,
        {
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
          entityType: input.entity_type,
          entityId: input.entity_id,
          action: 'comment.created',
          actor,
          metadata: { comment_id: c.id, excerpt: excerpt(c.content), task_id: ctx.taskId },
        },
        effects,
      );

      await this.notifications.notify(
        tx,
        {
          recipients: users.map((u) => u.id),
          workspaceId: ctx.workspaceId,
          type: 'comment_mention',
          title: `${user.display_name} menyebut Anda di ${ctx.title}`,
          body: excerpt(c.content, 200),
          projectId: ctx.projectId,
          entityType: ctx.taskId ? 'task' : 'project',
          entityId: ctx.taskId ?? ctx.projectId,
          actor,
        },
        effects,
      );

      // Mention agent oleh manusia → agent run trigger "mention" (UC4)
      for (const agent of agents) {
        if (!agent.is_active) {
          warnings.push(`AGENT_INACTIVE:${agent.handle}`);
          continue;
        }
        if (!(await this.withinMentionLimit(tx, ctx))) {
          await this.systemComment(tx, ctx, c.id, 'Batas permintaan ke agent tercapai, coba lagi nanti.', effects);
          warnings.push(`MENTION_RATE_LIMITED:${agent.handle}`);
          continue;
        }
        await this.runs.createRun(
          tx,
          {
            workspaceId: ctx.workspaceId,
            projectId: ctx.projectId,
            taskId: ctx.taskId,
            agentId: agent.id,
            trigger: 'mention',
            triggerRefId: c.id,
            dispatchedBy: user.id,
          },
          effects,
        );
      }
      return c;
    });

    const names = await this.mentionNames([comment]);
    const dto = this.toDto(comment, names);
    effects.add(() => this.realtime.toProjectAndTask(ctx.projectId, ctx.taskId, RealtimeEvent.COMMENT_CREATED, { comment: dto }, { actor, originClientId: clientId }));
    await effects.run();
    return { ...dto, warnings };
  }

  async update(user: AuthUser, commentId: string, input: UpdateCommentInput, clientId: string | null) {
    const existing = await this.findComment(commentId);
    const ctx = await this.resolveEntity(user, existing.entity_type as 'project' | 'task' | 'block', existing.entity_id, 'member');
    if (existing.author_type !== 'user' || existing.author_user_id !== user.id) throw Errors.forbidden('Hanya penulis yang dapat mengubah komentar');

    const { valid, users } = await this.validateMentions(ctx.workspaceId, input.mentions);
    const before = new Set(((existing.mentions ?? []) as MentionRef[]).filter((m) => m.type === 'user').map((m) => m.id));
    const actor = userActor(user);
    const effects = new AfterCommit();

    const updated = await this.prisma.tx(async (tx) => {
      const c = await tx.comments.update({
        where: { id: commentId },
        data: { content: input.content, mentions: valid as unknown as Prisma.InputJsonValue, edited_at: new Date() },
        include: commentInclude,
      });
      await this.notifications.notify(
        tx,
        {
          recipients: users.filter((u) => !before.has(u.id)).map((u) => u.id),
          workspaceId: ctx.workspaceId,
          type: 'comment_mention',
          title: `${user.display_name} menyebut Anda di ${ctx.title}`,
          body: excerpt(c.content, 200),
          projectId: ctx.projectId,
          entityType: ctx.taskId ? 'task' : 'project',
          entityId: ctx.taskId ?? ctx.projectId,
          actor,
        },
        effects,
      );
      return c;
    });
    const dto = this.toDto(updated, await this.mentionNames([updated]));
    effects.add(() => this.realtime.toProjectAndTask(ctx.projectId, ctx.taskId, RealtimeEvent.COMMENT_UPDATED, { comment: dto }, { actor, originClientId: clientId }));
    await effects.run();
    return dto;
  }

  async remove(user: AuthUser, commentId: string, clientId: string | null): Promise<void> {
    const existing = await this.findComment(commentId);
    const ctx = await this.resolveEntity(user, existing.entity_type as 'project' | 'task' | 'block', existing.entity_id, 'member');
    const isAuthor = existing.author_type === 'user' && existing.author_user_id === user.id;
    if (!isAuthor && !hasRole(ctx.role, 'admin')) throw Errors.forbidden('Hanya penulis atau Admin yang dapat menghapus komentar');
    const now = new Date();
    await this.prisma.comments.updateMany({ where: { OR: [{ id: commentId }, { parent_comment_id: commentId }], deleted_at: null }, data: { deleted_at: now } });
    this.realtime.toProjectAndTask(ctx.projectId, ctx.taskId, RealtimeEvent.COMMENT_DELETED, { comment_id: commentId }, { actor: userActor(user), originClientId: clientId });
  }

  // ---------- helpers ----------

  /** Resolusi entity komentar + cek akses (dipakai juga oleh webhook agent dengan actor agent). */
  async resolveEntity(user: AuthUser, type: 'project' | 'task' | 'block', id: string, minRole: workspace_role): Promise<EntityContext> {
    if (type === 'project') {
      const a = await this.access.assertProject(user.id, id, minRole);
      return { workspaceId: a.workspace.id, projectId: a.project.id, taskId: null, title: a.project.title, role: a.role };
    }
    if (type === 'task') {
      const a = await this.access.assertTask(user.id, id, minRole);
      return { workspaceId: a.workspace.id, projectId: a.project.id, taskId: a.task.id, title: a.task.title, role: a.role };
    }
    const a = await this.access.assertBlock(user.id, id, minRole);
    const title = a.block.task_id
      ? ((await this.prisma.tasks.findUnique({ where: { id: a.block.task_id }, select: { title: true } }))?.title ?? a.project.title)
      : a.project.title;
    return { workspaceId: a.workspace.id, projectId: a.project.id, taskId: a.block.task_id, title, role: a.role };
  }

  /** Mention valid = member workspace (user) atau agent workspace (belum dihapus). */
  async validateMentions(workspaceId: string, mentions: MentionRef[]) {
    const userIds = [...new Set(mentions.filter((m) => m.type === 'user').map((m) => m.id))];
    const agentIds = [...new Set(mentions.filter((m) => m.type === 'agent').map((m) => m.id))];
    const [members, agentsList] = await Promise.all([
      userIds.length
        ? this.prisma.workspace_members.findMany({ where: { workspace_id: workspaceId, user_id: { in: userIds } }, select: { user_id: true } })
        : [],
      agentIds.length
        ? this.prisma.agents.findMany({ where: { workspace_id: workspaceId, id: { in: agentIds }, deleted_at: null }, select: { id: true, handle: true, is_active: true } })
        : [],
    ]);
    const users = members.map((m) => ({ id: m.user_id }));
    const valid: MentionRef[] = [...users.map((u) => ({ type: 'user' as const, id: u.id })), ...agentsList.map((a) => ({ type: 'agent' as const, id: a.id }))];
    return { valid, users, agents: agentsList };
  }

  /** Maks 10 run mention per task (atau per project untuk komentar level project) per jam. */
  private async withinMentionLimit(tx: Tx, ctx: EntityContext): Promise<boolean> {
    const count = await tx.agent_runs.count({
      where: { trigger: 'mention', project_id: ctx.projectId, task_id: ctx.taskId, created_at: { gt: new Date(Date.now() - 3_600_000) } },
    });
    return count < MENTION_RUNS_PER_HOUR;
  }

  private async systemComment(tx: Tx, ctx: EntityContext, parentId: string, content: string, effects: AfterCommit): Promise<void> {
    const c = await tx.comments.create({
      data: {
        project_id: ctx.projectId,
        entity_type: ctx.taskId ? 'task' : 'project',
        entity_id: ctx.taskId ?? ctx.projectId,
        parent_comment_id: parentId,
        author_type: 'system',
        content,
      },
      include: commentInclude,
    });
    const dto = this.toDto(c, new Map());
    effects.add(() => this.realtime.toProjectAndTask(ctx.projectId, ctx.taskId, RealtimeEvent.COMMENT_CREATED, { comment: dto }, { actor: { type: 'system', id: null } }));
  }

  private async findComment(id: string) {
    const c = await this.prisma.comments.findFirst({ where: { id, deleted_at: null } });
    if (!c) throw Errors.notFound('Komentar tidak ditemukan');
    return c;
  }

  private async mentionNames(comments: CommentRow[]): Promise<Map<string, string>> {
    const refs = comments.flatMap((c) => (c.mentions ?? []) as MentionRef[]);
    const resolve = await this.actors.resolve(refs);
    return new Map(refs.map((r) => [`${r.type}:${r.id}`, resolve(r)?.name ?? '']));
  }

  toDto(c: CommentRow, mentionNames: Map<string, string>) {
    const author: Actor & { avatar_url: string | null } =
      c.author_type === 'user' && c.author_user
        ? { type: 'user', id: c.author_user.id, name: c.author_user.display_name, avatar_url: c.author_user.avatar_url }
        : c.author_type === 'agent' && c.author_agent
          ? { type: 'agent', id: c.author_agent.id, name: c.author_agent.name, avatar_url: c.author_agent.avatar_url }
          : { type: 'system', id: null, name: 'Sistem', avatar_url: null };
    return {
      id: c.id,
      project_id: c.project_id,
      entity_type: c.entity_type,
      entity_id: c.entity_id,
      parent_comment_id: c.parent_comment_id,
      author,
      content: c.content,
      mentions: ((c.mentions ?? []) as MentionRef[]).map((m) => ({ ...m, name: mentionNames.get(`${m.type}:${m.id}`) ?? null })),
      edited_at: c.edited_at,
      created_at: c.created_at,
      reply_count: c._count.replies,
    };
  }
}
