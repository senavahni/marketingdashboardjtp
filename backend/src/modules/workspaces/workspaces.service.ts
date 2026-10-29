import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { workspace_role } from '../../generated/prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AccessService } from '../core/access.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AddMemberInput, CreateWorkspaceInput, UpdateWorkspaceInput } from './workspaces.schemas';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(user: AuthUser) {
    const memberships = await this.prisma.workspace_members.findMany({
      where: { user_id: user.id, workspace: { deleted_at: null } },
      include: { workspace: true },
      orderBy: { created_at: 'asc' },
    });
    return { data: memberships.map((m) => ({ ...this.toDto(m.workspace), role: m.role })), next_cursor: null };
  }

  async create(user: AuthUser, input: CreateWorkspaceInput) {
    const ws = await this.prisma.tx(async (tx) => {
      const ws = await tx.workspaces.create({ data: { name: input.name, timezone: input.timezone, owner_id: user.id } });
      await tx.workspace_members.create({ data: { workspace_id: ws.id, user_id: user.id, role: 'owner' } });
      return ws;
    });
    await this.access.invalidateMembership(ws.id, user.id);
    return { ...this.toDto(ws), role: 'owner' as workspace_role };
  }

  async get(user: AuthUser, workspaceId: string) {
    const { role } = await this.access.assertWorkspace(user.id, workspaceId);
    const ws = await this.prisma.workspaces.findUniqueOrThrow({ where: { id: workspaceId } });
    return { ...this.toDto(ws), role };
  }

  async update(user: AuthUser, workspaceId: string, input: UpdateWorkspaceInput) {
    const { role } = await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    const ws = await this.prisma.workspaces.update({ where: { id: workspaceId }, data: input });
    return { ...this.toDto(ws), role };
  }

  async listMembers(user: AuthUser, workspaceId: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const members = await this.prisma.workspace_members.findMany({
      where: { workspace_id: workspaceId },
      include: { user: { select: { id: true, display_name: true, username: true, email: true, avatar_url: true } } },
      orderBy: { created_at: 'asc' },
    });
    return { data: members.map((m) => ({ user: m.user, role: m.role, created_at: m.created_at })), next_cursor: null };
  }

  async addMember(user: AuthUser, workspaceId: string, input: AddMemberInput) {
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    const target = await this.prisma.users.findUnique({
      where: { email: input.email },
      select: { id: true, display_name: true, username: true, email: true, avatar_url: true, is_active: true },
    });
    if (!target?.is_active) throw Errors.notFound('User dengan email tersebut belum terdaftar', ErrorCode.USER_NOT_FOUND);

    const member = await this.prisma.tx(async (tx) => {
      const existing = await tx.workspace_members.findUnique({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: target.id } } });
      if (existing) throw Errors.conflict(ErrorCode.ALREADY_EXISTS, 'User sudah menjadi anggota workspace');
      const m = await tx.workspace_members.create({ data: { workspace_id: workspaceId, user_id: target.id, role: input.role } });
      await this.activity.log(tx, {
        workspaceId,
        entityType: 'member',
        entityId: target.id,
        action: 'member.added',
        actor: userActor(user),
        metadata: { user_id: target.id, role: input.role },
      });
      return m;
    });
    await this.access.invalidateMembership(workspaceId, target.id);
    const { is_active: _active, ...publicUser } = target;
    return { user: publicUser, role: member.role, created_at: member.created_at };
  }

  async updateMember(user: AuthUser, workspaceId: string, targetUserId: string, role: Exclude<workspace_role, 'owner'>) {
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    const member = await this.findMember(workspaceId, targetUserId);
    if (member.role === 'owner') {
      throw Errors.business(ErrorCode.LAST_OWNER, 'Role Owner tidak dapat diubah. Gunakan transfer ownership.');
    }
    const updated = await this.prisma.tx(async (tx) => {
      const m = await tx.workspace_members.update({
        where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
        data: { role },
      });
      if (role === 'viewer') {
        // Viewer tidak boleh menjadi assignee
        await tx.tasks.updateMany({
          where: { assignee_user_id: targetUserId, project: { workspace_id: workspaceId } },
          data: { assignee_type: null, assignee_user_id: null },
        });
      }
      await this.activity.log(tx, {
        workspaceId,
        entityType: 'member',
        entityId: targetUserId,
        action: 'member.role_changed',
        actor: userActor(user),
        metadata: { user_id: targetUserId, from: member.role, to: role },
      });
      return m;
    });
    await this.access.invalidateMembership(workspaceId, targetUserId);
    return { user_id: targetUserId, role: updated.role };
  }

  async removeMember(user: AuthUser, workspaceId: string, targetUserId: string): Promise<void> {
    await this.access.assertWorkspace(user.id, workspaceId, targetUserId === user.id ? 'viewer' : 'admin');
    const member = await this.findMember(workspaceId, targetUserId);
    if (member.role === 'owner') throw Errors.business(ErrorCode.LAST_OWNER, 'Owner tidak dapat dihapus dari workspace');

    await this.prisma.tx(async (tx) => {
      await tx.workspace_members.delete({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } } });
      await tx.tasks.updateMany({
        where: { assignee_user_id: targetUserId, project: { workspace_id: workspaceId } },
        data: { assignee_type: null, assignee_user_id: null },
      });
      await this.activity.log(tx, {
        workspaceId,
        entityType: 'member',
        entityId: targetUserId,
        action: 'member.removed',
        actor: userActor(user),
        metadata: { user_id: targetUserId, role: member.role },
      });
    });
    await this.access.invalidateMembership(workspaceId, targetUserId);
    await this.realtime.evictUserFromResourceRooms(targetUserId);
  }

  async transferOwnership(user: AuthUser, workspaceId: string, newOwnerId: string) {
    await this.access.assertWorkspace(user.id, workspaceId, 'owner');
    if (newOwnerId === user.id) throw Errors.validation('User tersebut sudah menjadi Owner');
    await this.findMember(workspaceId, newOwnerId);
    await this.prisma.tx(async (tx) => {
      await tx.workspace_members.update({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: user.id } }, data: { role: 'admin' } });
      await tx.workspace_members.update({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: newOwnerId } }, data: { role: 'owner' } });
      await tx.workspaces.update({ where: { id: workspaceId }, data: { owner_id: newOwnerId } });
      await this.activity.log(tx, {
        workspaceId,
        entityType: 'member',
        entityId: newOwnerId,
        action: 'member.role_changed',
        actor: userActor(user),
        metadata: { user_id: newOwnerId, to: 'owner', previous_owner: user.id },
      });
    });
    await Promise.all([this.access.invalidateMembership(workspaceId, user.id), this.access.invalidateMembership(workspaceId, newOwnerId)]);
    return { owner_id: newOwnerId };
  }

  /** Kandidat assignee & mention: humans (role ≠ viewer) + agents aktif. */
  async assignees(user: AuthUser, workspaceId: string, q?: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const term = q?.trim();
    const [members, agentsList] = await Promise.all([
      this.prisma.workspace_members.findMany({
        where: {
          workspace_id: workspaceId,
          role: { not: 'viewer' },
          user: {
            is_active: true,
            ...(term ? { OR: [{ display_name: { startsWith: term, mode: 'insensitive' } }, { username: { startsWith: term, mode: 'insensitive' } }] } : {}),
          },
        },
        include: { user: { select: { id: true, display_name: true, username: true, avatar_url: true } } },
        take: 20,
        orderBy: { user: { display_name: 'asc' } },
      }),
      this.prisma.agents.findMany({
        where: {
          workspace_id: workspaceId,
          deleted_at: null,
          is_active: true,
          ...(term ? { OR: [{ name: { startsWith: term, mode: 'insensitive' } }, { handle: { startsWith: term, mode: 'insensitive' } }] } : {}),
        },
        select: { id: true, name: true, handle: true, description: true, avatar_url: true, is_active: true },
        take: 20,
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      humans: members.map((m) => ({ id: m.user.id, name: m.user.display_name, username: m.user.username, avatar_url: m.user.avatar_url })),
      agents: agentsList,
    };
  }

  private async findMember(workspaceId: string, userId: string) {
    const m = await this.prisma.workspace_members.findUnique({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } } });
    if (!m) throw Errors.notFound('Member tidak ditemukan');
    return m;
  }

  private toDto(ws: { id: string; name: string; timezone: string; owner_id: string; created_at: Date; updated_at: Date }) {
    return { id: ws.id, name: ws.name, timezone: ws.timezone, owner_id: ws.owner_id, created_at: ws.created_at, updated_at: ws.updated_at };
  }
}
