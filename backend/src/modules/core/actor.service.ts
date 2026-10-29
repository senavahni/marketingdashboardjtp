import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface ActorRef {
  type: 'user' | 'agent' | 'system';
  id: string | null;
}
export interface ActorDto extends ActorRef {
  name: string;
  avatar_url: string | null;
}

/** Resolusi nama aktor polimorfik (user/agent/system) secara batch untuk menghindari N+1. */
@Injectable()
export class ActorService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(refs: ActorRef[]): Promise<(ref: ActorRef | null | undefined) => ActorDto | null> {
    const userIds = [...new Set(refs.filter((r) => r.type === 'user' && r.id).map((r) => r.id as string))];
    const agentIds = [...new Set(refs.filter((r) => r.type === 'agent' && r.id).map((r) => r.id as string))];
    const [users, agentsList] = await Promise.all([
      userIds.length
        ? this.prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, display_name: true, avatar_url: true } })
        : [],
      agentIds.length
        ? this.prisma.agents.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, avatar_url: true } })
        : [],
    ]);
    const map = new Map<string, ActorDto>();
    for (const u of users) map.set(`user:${u.id}`, { type: 'user', id: u.id, name: u.display_name, avatar_url: u.avatar_url });
    for (const a of agentsList) map.set(`agent:${a.id}`, { type: 'agent', id: a.id, name: a.name, avatar_url: a.avatar_url });

    return (ref) => {
      if (!ref) return null;
      if (ref.type === 'system' || !ref.id) return { type: 'system', id: null, name: 'Sistem', avatar_url: null };
      return map.get(`${ref.type}:${ref.id}`) ?? { type: ref.type, id: ref.id, name: 'Tidak dikenal', avatar_url: null };
    };
  }
}
