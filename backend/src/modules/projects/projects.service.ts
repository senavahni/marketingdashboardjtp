import { Injectable } from '@nestjs/common';
import { hasRole } from '../../common/constants/domain';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AccessService } from '../core/access.service';
import { CreateProjectInput, UpdateProjectInput } from './projects.schemas';

const projectInclude = {
  creator: { select: { id: true, display_name: true } },
  _count: { select: { tasks: { where: { deleted_at: null } } } },
} satisfies Prisma.projectsInclude;
type ProjectRow = Prisma.projectsGetPayload<{ include: typeof projectInclude }>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly runs: AgentRunsService,
  ) {}

  async list(user: AuthUser, workspaceId: string) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const rows = await this.prisma.projects.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      include: projectInclude,
      orderBy: { updated_at: 'desc' },
    });
    return { data: rows.map((p) => this.toDto(p)), next_cursor: null };
  }

  async create(user: AuthUser, input: CreateProjectInput) {
    await this.access.assertWorkspace(user.id, input.workspace_id, 'member');
    const effects = new AfterCommit();
    const project = await this.prisma.tx(async (tx) => {
      const p = await tx.projects.create({
        data: { workspace_id: input.workspace_id, title: input.title, description: input.description, icon: input.icon, created_by: user.id },
        include: projectInclude,
      });
      await this.activity.log(
        tx,
        { workspaceId: p.workspace_id, projectId: p.id, entityType: 'project', entityId: p.id, action: 'project.created', actor: userActor(user), metadata: { title: p.title } },
        effects,
      );
      return p;
    });
    await effects.run();
    return this.toDto(project);
  }

  async get(user: AuthUser, projectId: string) {
    const { role } = await this.access.assertProject(user.id, projectId);
    const p = await this.prisma.projects.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude });
    return { ...this.toDto(p), my_role: role };
  }

  async update(user: AuthUser, projectId: string, input: UpdateProjectInput) {
    const { project } = await this.access.assertProject(user.id, projectId, 'member');
    const effects = new AfterCommit();
    const updated = await this.prisma.tx(async (tx) => {
      const p = await tx.projects.update({ where: { id: projectId }, data: input, include: projectInclude });
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(input) as (keyof UpdateProjectInput)[]) {
        if (project[key] !== p[key]) changes[key] = { from: project[key], to: p[key] };
      }
      await this.activity.log(
        tx,
        { workspaceId: p.workspace_id, projectId, entityType: 'project', entityId: projectId, action: 'project.updated', actor: userActor(user), metadata: { changes } },
        effects,
      );
      return p;
    });
    await effects.run();
    return this.toDto(updated);
  }

  /** Soft delete project beserta seluruh task, blok, dan komentar (TASK_002 Cascade Delete). */
  async remove(user: AuthUser, projectId: string): Promise<void> {
    const { project, role } = await this.access.assertProject(user.id, projectId, 'member');
    if (!hasRole(role, 'admin') && project.created_by !== user.id) {
      throw Errors.forbidden('Hanya Admin/Owner atau pembuat project yang dapat menghapus project');
    }
    const now = new Date();
    const effects = new AfterCommit();
    await this.prisma.tx(async (tx) => {
      await this.runs.cancelActive(tx, { project_id: projectId }, 'task_deleted', userActor(user), effects);
      await tx.projects.update({ where: { id: projectId }, data: { deleted_at: now } });
      const tasks = await tx.tasks.updateMany({ where: { project_id: projectId, deleted_at: null }, data: { deleted_at: now } });
      await tx.document_blocks.updateMany({ where: { project_id: projectId, deleted_at: null }, data: { deleted_at: now } });
      await tx.comments.updateMany({ where: { project_id: projectId, deleted_at: null }, data: { deleted_at: now } });
      await this.activity.log(tx, {
        workspaceId: project.workspace_id,
        projectId,
        entityType: 'project',
        entityId: projectId,
        action: 'project.deleted',
        actor: userActor(user),
        metadata: { title: project.title, deleted_tasks: tasks.count },
      });
    });
    await effects.run();
  }

  toDto(p: ProjectRow) {
    return {
      id: p.id,
      workspace_id: p.workspace_id,
      title: p.title,
      description: p.description,
      icon: p.icon,
      created_by: p.creator ? { id: p.creator.id, name: p.creator.display_name } : null,
      task_count: p._count.tasks,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }
}
