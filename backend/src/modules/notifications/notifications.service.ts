import { Injectable } from '@nestjs/common';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { entity_type, notifications } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { ActorService } from '../core/actor.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';

export type NotificationType = 'task_assigned' | 'comment_mention' | 'agent_comment' | 'agent_task_completed' | 'agent_task_failed';

export interface NotifyInput {
  recipients: (string | null | undefined)[];
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  projectId?: string | null;
  entityType?: entity_type | null;
  entityId?: string | null;
  actor: Actor;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly actors: ActorService,
  ) {}

  /** Membuat notifikasi (tidak pernah ke aktor sendiri) dan mengirim real-time setelah commit. */
  async notify(tx: Tx, input: NotifyInput, effects: AfterCommit): Promise<void> {
    const selfId = input.actor.type === 'user' ? input.actor.id : null;
    const recipients = [...new Set(input.recipients.filter((r): r is string => !!r && r !== selfId))];
    for (const userId of recipients) {
      const n = await tx.notifications.create({
        data: {
          user_id: userId,
          workspace_id: input.workspaceId,
          type: input.type,
          title: input.title.slice(0, 200),
          body: input.body ?? null,
          project_id: input.projectId ?? null,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          actor_type: input.actor.type,
          actor_id: input.actor.id,
        },
      });
      const actorDto = { type: input.actor.type, id: input.actor.id, name: input.actor.name ?? null, avatar_url: null };
      effects.add(async () => {
        const unread = await this.prisma.notifications.count({ where: { user_id: userId, read_at: null } });
        this.realtime.toUser(userId, RealtimeEvent.NOTIFICATION_CREATED, { notification: this.toDto(n, actorDto), unread_count: unread });
      });
    }
  }

  async list(userId: string, unreadOnly: boolean, limit: number, cursor?: string) {
    const offset = decodeCursor(cursor);
    const rows = await this.prisma.notifications.findMany({
      where: { user_id: userId, ...(unreadOnly ? { read_at: null } : {}) },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: limit + 1,
    });
    const resolve = await this.actors.resolve(rows.map((r) => ({ type: r.actor_type ?? 'system', id: r.actor_id })));
    const page = toPage(rows, offset, limit);
    return { ...page, data: page.data.map((n) => this.toDto(n, resolve({ type: n.actor_type ?? 'system', id: n.actor_id }))) };
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notifications.count({ where: { user_id: userId, read_at: null } }) };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notifications.findFirst({ where: { id, user_id: userId } });
    if (!n) throw Errors.notFound('Notifikasi tidak ditemukan');
    const updated = n.read_at ? n : await this.prisma.notifications.update({ where: { id }, data: { read_at: new Date() } });
    return this.toDto(updated, null);
  }

  async readAll(userId: string) {
    const res = await this.prisma.notifications.updateMany({ where: { user_id: userId, read_at: null }, data: { read_at: new Date() } });
    return { updated: res.count };
  }

  toDto(n: notifications, actor: { type: string; id: string | null; name: string | null; avatar_url?: string | null } | null) {
    let url: string | null = null;
    if (n.project_id) {
      url = `/w/${n.workspace_id}/p/${n.project_id}`;
      if (n.entity_type === 'task' && n.entity_id) url += `/t/${n.entity_id}`;
    }
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      workspace_id: n.workspace_id,
      project_id: n.project_id,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
      actor,
      read_at: n.read_at,
      created_at: n.created_at,
      url,
    };
  }
}
