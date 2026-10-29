import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Namespace } from 'socket.io';
import { Actor } from '../../common/types/request.types';
import { RealtimeEventName, rooms } from './realtime.events';

export interface EmitMeta {
  actor?: Actor | null;
  originClientId?: string | null;
}

/** Pintu keluar event real-time. Dipanggil modul lain SETELAH transaksi commit. */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Namespace | null = null;

  attach(server: Namespace): void {
    this.server = server;
  }

  emit(roomNames: string[], event: RealtimeEventName, payload: Record<string, unknown>, meta: EmitMeta = {}): void {
    if (!this.server || roomNames.length === 0) return;
    this.server.to(roomNames).emit(event, {
      ...payload,
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      actor: meta.actor ? { type: meta.actor.type, id: meta.actor.id, name: meta.actor.name ?? null } : null,
      origin_client_id: meta.originClientId ?? null,
    });
  }

  toProject(projectId: string, event: RealtimeEventName, payload: Record<string, unknown>, meta?: EmitMeta): void {
    this.emit([rooms.project(projectId)], event, payload, meta);
  }

  toProjectAndTask(projectId: string, taskId: string | null, event: RealtimeEventName, payload: Record<string, unknown>, meta?: EmitMeta): void {
    this.emit(taskId ? [rooms.project(projectId), rooms.task(taskId)] : [rooms.project(projectId)], event, payload, meta);
  }

  toTaskOrProject(projectId: string, taskId: string | null, event: RealtimeEventName, payload: Record<string, unknown>, meta?: EmitMeta): void {
    this.emit([taskId ? rooms.task(taskId) : rooms.project(projectId)], event, payload, meta);
  }

  toUser(userId: string, event: RealtimeEventName, payload: Record<string, unknown>): void {
    this.emit([rooms.user(userId)], event, payload);
  }

  /** Keluarkan socket user dari semua room project/task (dipakai saat member dihapus). */
  async evictUserFromResourceRooms(userId: string): Promise<void> {
    if (!this.server) return;
    try {
      const sockets = await this.server.in(rooms.user(userId)).fetchSockets();
      for (const s of sockets) {
        for (const room of s.rooms) if (room.startsWith('project:') || room.startsWith('task:')) s.leave(room);
      }
    } catch (err) {
      this.logger.warn(`Gagal mengeluarkan user dari room: ${(err as Error).message}`);
    }
  }
}
