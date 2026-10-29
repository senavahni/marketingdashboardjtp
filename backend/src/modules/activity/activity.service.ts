import { Injectable } from '@nestjs/common';
import { Actor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { activity_logs, entity_type, Prisma } from '../../generated/prisma/client';
import { RedisService } from '../../redis/redis.service';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { decodeCursor, Page, toPage } from '../../utils/helpers/pagination.util';
import { ActorService } from '../core/actor.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';

export interface ActivityEntry {
  workspaceId: string;
  projectId?: string | null;
  entityType: entity_type;
  entityId: string;
  action: string;
  actor: Actor;
  /** Untuk aktivitas blok/komentar di dalam task, isi metadata.task_id agar muncul di feed task. */
  metadata?: Record<string, unknown>;
}

/** Activity log append-only (katalog action: TASK_002 §Business Logic). */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly actors: ActorService,
    private readonly realtime: RealtimeService,
  ) {}

  async log(tx: Tx, entry: ActivityEntry, effects?: AfterCommit): Promise<activity_logs> {
    const record = await tx.activity_logs.create({
      data: {
        workspace_id: entry.workspaceId,
        project_id: entry.projectId ?? null,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        actor_type: entry.actor.type,
        actor_id: entry.actor.id,
        metadata_json: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    if (effects && entry.projectId) {
      const projectId = entry.projectId;
      effects.add(() =>
        this.realtime.toProject(projectId, RealtimeEvent.ACTIVITY_CREATED, {
          activity: this.toDto(record, { type: entry.actor.type, id: entry.actor.id, name: entry.actor.name ?? null }),
        }),
      );
    }
    return record;
  }

  /** true jika penanda throttle baru dibuat (dipakai untuk task.content_edited: maks 1x/10 menit per user per task). */
  async acquireThrottle(key: string, ttlSec: number): Promise<boolean> {
    try {
      return (await this.redis.client.set(`throttle:${key}`, '1', 'EX', ttlSec, 'NX')) === 'OK';
    } catch {
      return true;
    }
  }

  async listForProject(projectId: string, limit: number, cursor?: string): Promise<Page<ReturnType<ActivityService['toDto']>>> {
    return this.list({ project_id: projectId }, limit, cursor);
  }

  async listForTask(taskId: string, limit: number, cursor?: string) {
    return this.list(
      {
        OR: [
          { entity_type: 'task', entity_id: taskId },
          { metadata_json: { path: ['task_id'], equals: taskId } },
        ],
      },
      limit,
      cursor,
    );
  }

  private async list(where: Prisma.activity_logsWhereInput, limit: number, cursor?: string) {
    const offset = decodeCursor(cursor);
    const rows = await this.prisma.activity_logs.findMany({ where, orderBy: { created_at: 'desc' }, skip: offset, take: limit + 1 });
    const resolve = await this.actors.resolve(rows.map((r) => ({ type: r.actor_type, id: r.actor_id })));
    const page = toPage(rows, offset, limit);
    return {
      ...page,
      data: page.data.map((r) => {
        const actor = resolve({ type: r.actor_type, id: r.actor_id });
        return this.toDto(r, actor ? { type: actor.type, id: actor.id, name: actor.name } : null);
      }),
    };
  }

  toDto(r: activity_logs, actor: { type: string; id: string | null; name: string | null } | null) {
    return {
      id: r.id,
      project_id: r.project_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      actor,
      metadata: r.metadata_json,
      created_at: r.created_at,
    };
  }
}
