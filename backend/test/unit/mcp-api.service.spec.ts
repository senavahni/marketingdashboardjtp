import { McpAgent, McpApiService } from '../../src/modules/mcp-api/mcp-api.service';
import {
  mcpBlockOpsSchema,
  mcpCommentSchema,
  mcpCreateProjectSchema,
  mcpMoveTaskSchema,
  mcpProjectQuerySchema,
  mcpRescheduleSchema,
  mcpTaskQuerySchema,
  mcpUpdateTaskSchema,
} from '../../src/shared/schemas/mcp-api.schema';

const projectId = '00000000-0000-4000-8000-000000000001';
const taskId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000003';
const agent: McpAgent = {
  id: '00000000-0000-4000-8000-000000000004',
  workspace_id: workspaceId,
  name: 'MCP Assistant',
  handle: 'mcp-assistant',
};

function createHarness() {
  const project = { id: projectId, title: 'Campaign', workspace_id: workspaceId };
  const task = { id: taskId, project_id: projectId, title: 'Brief' };
  const tx = {
    tasks: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const prisma = {
    projects: { findFirst: jest.fn().mockResolvedValue(project), findMany: jest.fn() },
    tasks: { findFirst: jest.fn().mockResolvedValue(task), findMany: jest.fn() },
    document_blocks: { findFirst: jest.fn().mockResolvedValue(null) },
    tx: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const activity = {};
  const realtime = { toProject: jest.fn().mockResolvedValue(undefined) };
  const projects = { createAs: jest.fn().mockResolvedValue(project) };
  const tasks = {
    createInTx: jest.fn().mockResolvedValue(task),
    updateAs: jest.fn().mockResolvedValue({ id: taskId }),
    moveAs: jest.fn().mockResolvedValue({ id: taskId }),
  };
  const reader = {
    getDto: jest.fn().mockResolvedValue({ id: taskId, title: 'Brief' }),
    getDtos: jest.fn().mockResolvedValue([{ id: taskId, title: 'Brief', status: 'todo' }]),
  };
  const timeline = { rescheduleAs: jest.fn().mockResolvedValue({ updated: true }) };
  const blocks = { applyAs: jest.fn().mockResolvedValue({ applied: 1, conflicts: [] }) };
  const comments = { createAs: jest.fn().mockResolvedValue({ id: 'comment-id' }) };
  const service = new McpApiService(
    prisma as never,
    activity as never,
    realtime as never,
    projects as never,
    tasks as never,
    reader as never,
    timeline as never,
    blocks as never,
    comments as never,
  );
  return {
    service,
    prisma,
    tx,
    realtime,
    projects,
    tasks,
    reader,
    timeline,
    blocks,
    comments,
    project,
    task,
  };
}

describe('McpApiService', () => {
  it('scopes project reads and project creation to the authenticated workspace', async () => {
    const harness = createHarness();
    await expect(harness.service.listProjects(agent, '00000000-0000-4000-8000-000000000009', {})).rejects.toThrow();

    harness.prisma.projects.findMany.mockResolvedValue([{ id: projectId, title: 'Campaign', icon: null, updated_at: new Date() }]);
    const projectsPage = await harness.service.listProjects(agent, workspaceId, mcpProjectQuerySchema.parse({ limit: 1 }));
    expect(projectsPage.data).toHaveLength(1);

    const input = mcpCreateProjectSchema.parse({
      workspace_id: workspaceId,
      title: 'New project',
    });
    await expect(harness.service.createProject(agent, { ...input, workspace_id: projectId })).rejects.toThrow();
    await harness.service.createProject(agent, input);
    expect(harness.projects.createAs).toHaveBeenCalledWith({ type: 'agent', id: agent.id, name: agent.name }, input);
  });

  it('scopes task lists and rejects unsupported field projections', async () => {
    const harness = createHarness();
    harness.prisma.projects.findFirst.mockResolvedValue(null);
    await expect(harness.service.listTasks(agent, projectId, mcpTaskQuerySchema.parse({}))).rejects.toThrow();

    harness.prisma.projects.findFirst.mockResolvedValue(harness.project);
    await expect(harness.service.listTasks(agent, projectId, mcpTaskQuerySchema.parse({ fields: 'secret_column' }))).rejects.toThrow();

    harness.prisma.tasks.findMany.mockResolvedValue([{ id: taskId }]);
    const result = await harness.service.listTasks(agent, projectId, mcpTaskQuerySchema.parse({ fields: 'id,title', limit: 1 }));
    expect(result.data).toEqual([{ id: taskId, title: 'Brief' }]);
    expect(harness.reader.getDtos).toHaveBeenCalledWith([taskId]);
  });

  it('creates tasks with agent attribution and initial blocks', async () => {
    const harness = createHarness();
    const result = await harness.service.createTasks(agent, projectId, [
      {
        client_ref: 'root',
        title: 'New task',
        initial_blocks: [
          {
            block_type: 'paragraph',
            content_json: {
              content: [{ type: 'text', text: 'Overview', styles: {} }],
            },
          },
        ],
      },
    ]);

    expect(result.created).toEqual([{ client_ref: 'root', id: taskId }]);
    expect(harness.tasks.createInTx).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        workspaceId: workspaceId,
        projectId,
        title: 'New task',
        assignee: null,
        actor: { type: 'agent', id: agent.id, name: agent.name },
      }),
      expect.any(Object),
    );
    expect(harness.realtime.toProject).toHaveBeenCalled();
    expect(harness.blocks.applyAs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent', id: agent.id }),
      expect.objectContaining({ taskId, title: 'Brief' }),
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'insert',
          block: expect.objectContaining({
            block_type: 'paragraph',
            order_index: 0,
          }),
        }),
      ]),
      null,
    );

    harness.tx.tasks.findFirst.mockResolvedValue({
      id: taskId,
      project_id: projectId,
      title: 'Parent',
    });
    await harness.service.createSubtasks(agent, taskId, [{ title: 'Child', parent_task_id: taskId }]);
  });

  it('updates, moves, and reschedules only workspace tasks', async () => {
    const harness = createHarness();
    await harness.service.updateTask(agent, taskId, mcpUpdateTaskSchema.parse({ status: 'done' }));
    expect(harness.tasks.updateAs).toHaveBeenCalledWith(
      { type: 'agent', id: agent.id, name: agent.name },
      harness.task,
      workspaceId,
      { status: 'done' },
      null,
    );
    expect(() => harness.service.rejectAssigneeUpdate()).toThrow();

    await harness.service.moveTask(agent, taskId, mcpMoveTaskSchema.parse({ new_parent_task_id: null }));
    expect(harness.tasks.moveAs).toHaveBeenCalled();

    await harness.service.reschedule(
      agent,
      taskId,
      mcpRescheduleSchema.parse({
        start_date: '2026-11-02',
        end_date: '2026-11-06',
        cascade: true,
      }),
    );
    expect(harness.timeline.rescheduleAs).toHaveBeenCalledWith(
      expect.any(Object),
      harness.task,
      workspaceId,
      { start_date: '2026-11-02', end_date: '2026-11-06', cascade: 'shift' },
      null,
    );
  });

  it('maps validated block operations to the existing blocks service', async () => {
    const harness = createHarness();
    await harness.service.applyBlockOperations(
      agent,
      mcpBlockOpsSchema.parse({
        target: { project_id: projectId },
        operations: [
          {
            op: 'append',
            block: {
              block_type: 'paragraph',
              content_json: { content: [{ type: 'text', text: 'Brief', styles: {} }] },
            },
          },
        ],
      }),
    );
    expect(harness.blocks.applyAs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent', id: agent.id }),
      expect.objectContaining({ taskId: null, title: 'Campaign' }),
      expect.arrayContaining([
        expect.objectContaining({
          op: 'upsert',
          mode: 'insert',
          block: expect.objectContaining({ block_type: 'paragraph' }),
        }),
      ]),
      null,
    );
  });

  it('creates comments for project, task, and block entities with agent attribution', async () => {
    const harness = createHarness();
    await harness.service.createComment(
      agent,
      mcpCommentSchema.parse({
        project_id: projectId,
        entity_type: 'project',
        entity_id: projectId,
        content: 'Project note',
      }),
    );
    expect(harness.comments.createAs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent', id: agent.id }),
      expect.objectContaining({ taskId: null, title: 'Campaign' }),
      expect.objectContaining({ content: 'Project note' }),
      null,
    );

    await harness.service.createComment(
      agent,
      mcpCommentSchema.parse({
        project_id: projectId,
        entity_type: 'task',
        entity_id: taskId,
        content: 'Task note',
      }),
    );
    expect(harness.comments.createAs).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ taskId, title: 'Brief' }),
      expect.objectContaining({ entity_type: 'task' }),
      null,
    );

    harness.prisma.document_blocks.findFirst.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000005',
      task_id: null,
    });
    await harness.service.createComment(
      agent,
      mcpCommentSchema.parse({
        project_id: projectId,
        entity_type: 'block',
        entity_id: '00000000-0000-4000-8000-000000000005',
        content: 'Block note',
      }),
    );
    expect(harness.prisma.document_blocks.findFirst).toHaveBeenCalled();
  });
});
