import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { agents } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AccessService } from '../core/access.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { TaskReaderService } from '../tasks/task-reader.service';
import { CreateAgentInput, UpdateAgentInput } from './agents.schemas';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly runs: AgentRunsService,
    private readonly realtime: RealtimeService,
    private readonly taskReader: TaskReaderService,
  ) {}

  async list(user: AuthUser, workspaceId: string, includeInactive: boolean) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const rows = await this.prisma.agents.findMany({
      where: { workspace_id: workspaceId, deleted_at: null, ...(includeInactive ? {} : { is_active: true }) },
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((a) => this.toDto(a)), next_cursor: null };
  }

  async create(user: AuthUser, workspaceId: string, input: CreateAgentInput) {
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    await this.assertUnique(workspaceId, input.handle, input.mcp_agent_key);
    const agent = await this.prisma.tx(async (tx) => {
      const a = await tx.agents.create({ data: { ...input, workspace_id: workspaceId, created_by: user.id } });
      await this.activity.log(tx, { workspaceId, entityType: 'agent', entityId: a.id, action: 'agent.created', actor: userActor(user), metadata: { agent_id: a.id } });
      return a;
    });
    return this.toDto(agent);
  }

  async update(user: AuthUser, agentId: string, input: UpdateAgentInput) {
    const { agent } = await this.access.assertAgent(user.id, agentId, 'admin');
    await this.assertUnique(agent.workspace_id, input.handle, input.mcp_agent_key, agent.id);
    const effects = new AfterCommit();
    const updated = await this.prisma.tx(async (tx) => {
      const a = await tx.agents.update({ where: { id: agentId }, data: input });
      const deactivated = agent.is_active && input.is_active === false;
      if (deactivated) await this.runs.cancelActive(tx, { agent_id: agentId }, 'agent_deactivated', userActor(user), effects);
      await this.activity.log(tx, {
        workspaceId: agent.workspace_id,
        entityType: 'agent',
        entityId: agentId,
        action: deactivated ? 'agent.deactivated' : 'agent.updated',
        actor: userActor(user),
        metadata: { agent_id: agentId, fields: Object.keys(input) },
      });
      return a;
    });
    await effects.run();
    return this.toDto(updated);
  }

  async remove(user: AuthUser, agentId: string): Promise<void> {
    const { agent } = await this.access.assertAgent(user.id, agentId, 'admin');
    const effects = new AfterCommit();
    await this.prisma.tx(async (tx) => {
      await tx.agents.update({ where: { id: agentId }, data: { deleted_at: new Date(), is_active: false } });
      await this.runs.cancelActive(tx, { agent_id: agentId }, 'agent_deactivated', userActor(user), effects);
      await this.unassignAgentTasks(tx, agentId, effects);
      await this.activity.log(tx, {
        workspaceId: agent.workspace_id,
        entityType: 'agent',
        entityId: agentId,
        action: 'agent.deactivated',
        actor: userActor(user),
        metadata: { agent_id: agentId, deleted: true },
      });
    });
    await effects.run();
  }

  private async unassignAgentTasks(tx: Tx, agentId: string, effects: AfterCommit): Promise<void> {
    const affected = await tx.tasks.findMany({ where: { assignee_agent_id: agentId, deleted_at: null }, select: { id: true, project_id: true } });
    if (affected.length === 0) return;
    await tx.tasks.updateMany({
      where: { id: { in: affected.map((t) => t.id) } },
      data: { assignee_type: null, assignee_agent_id: null, agent_status: 'idle' },
    });
    effects.add(async () => {
      const dtos = await this.taskReader.getDtos(affected.map((t) => t.id));
      for (const dto of dtos) this.realtime.toProjectAndTask(dto.project_id, dto.id, RealtimeEvent.TASK_UPDATED, { task: dto, changed_fields: ['assignee'] });
    });
  }

  private async assertUnique(workspaceId: string, handle?: string, key?: string, excludeId?: string): Promise<void> {
    if (!handle && !key) return;
    const clash = await this.prisma.agents.findFirst({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [...(handle ? [{ handle }] : []), ...(key ? [{ mcp_agent_key: key }] : [])],
      },
      select: { handle: true },
    });
    if (clash) {
      const field = handle && clash.handle.toLowerCase() === handle.toLowerCase() ? 'handle' : 'mcp_agent_key';
      throw Errors.conflict(ErrorCode.ALREADY_EXISTS, `${field} sudah dipakai agent lain`, { field });
    }
  }

  toDto(a: agents) {
    return {
      id: a.id,
      workspace_id: a.workspace_id,
      name: a.name,
      handle: a.handle,
      mcp_agent_key: a.mcp_agent_key,
      description: a.description,
      avatar_url: a.avatar_url,
      is_active: a.is_active,
      created_at: a.created_at,
      updated_at: a.updated_at,
    };
  }
}
