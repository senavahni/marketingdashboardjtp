import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ActorService } from '../core/actor.service';
import { TaskDto, taskInclude, TaskWithRelations, toTaskDto } from './task.mapper';

/** Membaca task dan membentuk DTO (dipakai banyak modul: tasks, timeline, webhooks, agent-runs). */
@Injectable()
export class TaskReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: ActorService,
  ) {}

  async toDtos(tasks: TaskWithRelations[]): Promise<TaskDto[]> {
    const resolve = await this.actors.resolve(tasks.map((t) => ({ type: t.created_by_type, id: t.created_by_id })));
    return tasks.map((t) => toTaskDto(t, resolve({ type: t.created_by_type, id: t.created_by_id })));
  }

  /** DTO untuk daftar id, urutan mengikuti input; task yang terhapus diabaikan. */
  async getDtos(ids: string[]): Promise<TaskDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.tasks.findMany({ where: { id: { in: ids }, deleted_at: null }, include: taskInclude });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return this.toDtos(ids.map((id) => byId.get(id)).filter((r): r is TaskWithRelations => !!r));
  }

  async getDto(id: string): Promise<TaskDto | null> {
    return (await this.getDtos([id]))[0] ?? null;
  }
}
