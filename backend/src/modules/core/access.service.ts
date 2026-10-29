import { Injectable } from '@nestjs/common';
import { hasRole } from '../../common/constants/domain';
import { Errors } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { agents, document_blocks, projects, tasks, workspace_role, workspaces } from '../../generated/prisma/client';
import { RedisService } from '../../redis/redis.service';

export interface WorkspaceAccess {
  workspace: Pick<workspaces, 'id' | 'name' | 'timezone'>;
  role: workspace_role;
}
export interface ProjectAccess extends WorkspaceAccess {
  project: projects;
}
export interface TaskAccess extends ProjectAccess {
  task: tasks;
}
export interface BlockAccess extends ProjectAccess {
  block: document_blocks;
}

const CACHE_TTL_SEC = 60;
const NONE = 'none';

/**
 * Pusat pengecekan hak akses (RBAC per workspace, anti-IDOR).
 * - Bukan anggota workspace → 404 NOT_FOUND (tidak membocorkan keberadaan resource)
 * - Anggota dengan role kurang → 403 FORBIDDEN
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async membershipRole(userId: string, workspaceId: string): Promise<workspace_role | null> {
    const key = `ws:member:${workspaceId}:${userId}`;
    try {
      const cached = await this.redis.client.get(key);
      if (cached) return cached === NONE ? null : (cached as workspace_role);
    } catch {
      /* cache opsional */
    }
    const m = await this.prisma.workspace_members.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
      select: { role: true },
    });
    const role = m?.role ?? null;
    await this.redis.client.set(key, role ?? NONE, 'EX', CACHE_TTL_SEC).catch(() => undefined);
    return role;
  }

  async invalidateMembership(workspaceId: string, userId: string): Promise<void> {
    await this.redis.client.del(`ws:member:${workspaceId}:${userId}`).catch(() => undefined);
  }

  async assertWorkspace(userId: string, workspaceId: string, minRole: workspace_role = 'viewer'): Promise<WorkspaceAccess> {
    const workspace = await this.prisma.workspaces.findFirst({
      where: { id: workspaceId, deleted_at: null },
      select: { id: true, name: true, timezone: true },
    });
    if (!workspace) throw Errors.notFound('Workspace tidak ditemukan');
    const role = await this.checkRole(userId, workspace.id, minRole);
    return { workspace, role };
  }

  async assertProject(userId: string, projectId: string, minRole: workspace_role = 'viewer'): Promise<ProjectAccess> {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, deleted_at: null, workspace: { deleted_at: null } },
      include: { workspace: { select: { id: true, name: true, timezone: true } } },
    });
    if (!project) throw Errors.notFound('Project tidak ditemukan');
    const role = await this.checkRole(userId, project.workspace_id, minRole);
    const { workspace, ...rest } = project;
    return { workspace, role, project: rest };
  }

  async assertTask(userId: string, taskId: string, minRole: workspace_role = 'viewer'): Promise<TaskAccess> {
    const task = await this.prisma.tasks.findFirst({ where: { id: taskId, deleted_at: null, project: { deleted_at: null } } });
    if (!task) throw Errors.notFound('Task tidak ditemukan');
    const access = await this.assertProject(userId, task.project_id, minRole);
    return { ...access, task };
  }

  async assertBlock(userId: string, blockId: string, minRole: workspace_role = 'viewer'): Promise<BlockAccess> {
    const block = await this.prisma.document_blocks.findFirst({ where: { id: blockId, deleted_at: null } });
    if (!block) throw Errors.notFound('Blok tidak ditemukan');
    if (block.task_id) {
      const t = await this.assertTask(userId, block.task_id, minRole);
      return { ...t, block };
    }
    const access = await this.assertProject(userId, block.project_id, minRole);
    return { ...access, block };
  }

  async assertAgent(userId: string, agentId: string, minRole: workspace_role = 'viewer'): Promise<WorkspaceAccess & { agent: agents }> {
    const agent = await this.prisma.agents.findFirst({ where: { id: agentId, deleted_at: null } });
    if (!agent) throw Errors.notFound('Agent tidak ditemukan');
    const access = await this.assertWorkspace(userId, agent.workspace_id, minRole);
    return { ...access, agent };
  }

  private async checkRole(userId: string, workspaceId: string, minRole: workspace_role): Promise<workspace_role> {
    const role = await this.membershipRole(userId, workspaceId);
    if (!role) throw Errors.notFound();
    if (!hasRole(role, minRole)) throw Errors.forbidden();
    return role;
  }
}
