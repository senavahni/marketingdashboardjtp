import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor, AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { document_blocks, Prisma, workspace_role } from '../../generated/prisma/client';
import {
  BlockContent,
  extractMentions,
  extractPlainText,
  replaceInvalidMentions,
  validateBlockContent,
} from '../../shared/schemas/block.schema';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AccessService } from '../core/access.service';
import { ActorService } from '../core/actor.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { BlockDto, buildBlockTree, toBlockDto } from './block.mapper';
import { BatchBlocksInput, CreateBlockInput, ReorderBlocksInput, UpdateBlockInput } from './blocks.schemas';

export interface BlockScope {
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  /** Judul task/project untuk teks notifikasi */
  title: string;
}

/** Operasi internal. mode: insert (harus baru), update (harus ada), upsert (keduanya). */
export type BlockOperation =
  | {
      op: 'upsert';
      mode: 'insert' | 'update' | 'upsert';
      block: { id: string; parent_block_id?: string | null; block_type?: string; content_json: unknown; order_index?: number };
      after_block_id?: string | null;
      expected_version?: number;
    }
  | { op: 'delete'; id: string; expected_version?: number };

export interface ApplyOptions {
  /** User wajib mengirim expected_version saat mengubah blok yang sudah ada; agent boleh last-write-wins. */
  requireVersionForUpdate: boolean;
}

export interface ApplyResult {
  applied: { id: string; version: number }[];
  conflicts: { id: string; server_version: number | null; server_block: document_blocks | null }[];
  upserted: document_blocks[];
  deletedIds: string[];
  newUserMentions: string[];
}

@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly actors: ActorService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly runs: AgentRunsService,
    private readonly config: AppConfigService,
  ) {}

  // ================= Read =================

  async taskBlocks(user: AuthUser, taskId: string) {
    const { task } = await this.access.assertTask(user.id, taskId);
    return { blocks: await this.tree(task.project_id, task.id) };
  }

  async briefBlocks(user: AuthUser, projectId: string) {
    await this.access.assertProject(user.id, projectId);
    return { blocks: await this.tree(projectId, null) };
  }

  async tree(projectId: string, taskId: string | null): Promise<BlockDto[]> {
    const rows = await this.prisma.document_blocks.findMany({ where: { project_id: projectId, task_id: taskId, deleted_at: null } });
    return buildBlockTree(await this.toDtos(rows));
  }

  async toDtos(rows: document_blocks[]): Promise<BlockDto[]> {
    const resolve = await this.actors.resolve(rows.map((r) => ({ type: r.last_edited_by_type, id: r.last_edited_by_id })));
    return rows.map((r) => toBlockDto(r, resolve({ type: r.last_edited_by_type, id: r.last_edited_by_id })));
  }

  // ================= Write (API user) =================

  async create(user: AuthUser, input: CreateBlockInput, clientId: string | null) {
    const scope = await this.resolveScope(user, input.project_id, input.task_id ?? null, 'member');
    const id = input.id ?? randomUUID();
    const result = await this.execute(
      user,
      scope,
      [
        {
          op: 'upsert',
          mode: 'insert',
          block: { id, parent_block_id: input.parent_block_id ?? null, block_type: input.block_type, content_json: input.content_json },
          after_block_id: input.after_block_id,
        },
      ],
      clientId,
    );
    if (result.conflicts.length) throw Errors.conflict(ErrorCode.ALREADY_EXISTS, 'ID blok sudah dipakai');
    return (await this.toDtos(result.upserted))[0];
  }

  async update(user: AuthUser, blockId: string, input: UpdateBlockInput, clientId: string | null) {
    const { block, workspace, project } = await this.access.assertBlock(user.id, blockId, 'member');
    const scope = await this.scopeFrom(workspace.id, project.id, project.title, block.task_id);
    const result = await this.execute(
      user,
      scope,
      [
        {
          op: 'upsert',
          mode: 'update',
          block: { id: blockId, block_type: input.block_type, content_json: input.content_json },
          expected_version: input.expected_version,
        },
      ],
      clientId,
    );
    if (result.conflicts.length) {
      const server = result.conflicts[0].server_block;
      throw Errors.conflict(ErrorCode.VERSION_CONFLICT, 'Blok telah diubah oleh pihak lain', {
        server_block: server ? (await this.toDtos([server]))[0] : null,
      });
    }
    return (await this.toDtos(result.upserted))[0];
  }

  async remove(user: AuthUser, blockId: string, clientId: string | null): Promise<void> {
    const { block, workspace, project } = await this.access.assertBlock(user.id, blockId, 'member');
    const scope = await this.scopeFrom(workspace.id, project.id, project.title, block.task_id);
    await this.execute(user, scope, [{ op: 'delete', id: blockId }], clientId);
  }

  async batch(user: AuthUser, input: BatchBlocksInput, clientId: string | null) {
    const scope = await this.resolveScope(user, input.project_id, input.task_id ?? null, 'member');
    const ops: BlockOperation[] = input.operations.map((o) =>
      o.op === 'delete' ? o : { op: 'upsert', mode: 'upsert', block: o.block, expected_version: o.expected_version },
    );
    const result = await this.execute(user, scope, ops, clientId);
    const conflictDtos = await this.toDtos(result.conflicts.map((c) => c.server_block).filter((b): b is document_blocks => !!b));
    const byId = new Map(conflictDtos.map((d) => [d.id, d]));
    return {
      applied: result.applied,
      conflicts: result.conflicts.map((c) => ({ id: c.id, server_block: byId.get(c.id) ?? null })),
    };
  }

  async reorder(user: AuthUser, input: ReorderBlocksInput, clientId: string | null) {
    const scope = await this.resolveScope(user, input.project_id, input.task_id ?? null, 'member');
    const ids = [...new Set(input.ordered_ids)];
    if (input.parent_block_id && ids.includes(input.parent_block_id)) throw Errors.validation('Blok tidak dapat menjadi parent dirinya sendiri');
    const found = await this.prisma.document_blocks.count({
      where: { id: { in: [...ids, ...(input.parent_block_id ? [input.parent_block_id] : [])] }, project_id: scope.projectId, task_id: scope.taskId, deleted_at: null },
    });
    if (found !== ids.length + (input.parent_block_id ? 1 : 0)) throw Errors.validation('Sebagian blok tidak ditemukan di dokumen ini');

    await this.prisma.tx(async (tx) => {
      const values = Prisma.join(ids.map((id, i) => Prisma.sql`(${id}::uuid, ${i}::int)`));
      await tx.$executeRaw`
        UPDATE document_blocks AS b SET order_index = v.idx, parent_block_id = ${input.parent_block_id}::uuid, updated_at = now()
        FROM (VALUES ${values}) AS v(id, idx) WHERE b.id = v.id`;
      await this.normalizeOrder(tx, scope, input.parent_block_id);
    });
    this.realtime.toTaskOrProject(scope.projectId, scope.taskId, RealtimeEvent.BLOCKS_REORDERED, {
      task_id: scope.taskId,
      project_id: scope.projectId,
      parent_block_id: input.parent_block_id,
      ordered_ids: ids,
    }, { actor: userActor(user), originClientId: clientId });
    return { parent_block_id: input.parent_block_id, ordered_ids: ids };
  }

  /** Jalankan AI Prompt Block (P1, feature flag FEATURE_AI_PROMPT_BLOCK). */
  async runPrompt(user: AuthUser, blockId: string) {
    if (!this.config.env.FEATURE_AI_PROMPT_BLOCK) throw Errors.notFound();
    const { block, workspace } = await this.access.assertBlock(user.id, blockId, 'member');
    if (block.block_type !== 'aiPrompt') throw Errors.validation('Blok bukan AI Prompt');
    const props = ((block.content_json ?? {}) as { props?: { prompt?: string; agent_id?: string | null } }).props ?? {};
    if (!props.prompt?.trim()) throw Errors.validation('Prompt masih kosong');
    if (!props.agent_id) throw Errors.validation('Pilih agent terlebih dahulu');
    const agent = await this.prisma.agents.findFirst({ where: { id: props.agent_id, workspace_id: workspace.id, deleted_at: null } });
    if (!agent) throw Errors.business(ErrorCode.INVALID_ASSIGNEE, 'Agent tidak ditemukan');
    if (!agent.is_active) throw Errors.business(ErrorCode.AGENT_INACTIVE, `Agent ${agent.name} tidak aktif`);
    const active = await this.prisma.agent_runs.findFirst({ where: { trigger_ref_id: blockId, status: { in: ['queued', 'dispatched', 'running'] } } });
    if (active) throw Errors.conflict(ErrorCode.ALREADY_EXISTS, 'Prompt ini sedang dijalankan');

    const effects = new AfterCommit();
    const run = await this.prisma.tx(async (tx) => {
      const r = await this.runs.createRun(
        tx,
        { workspaceId: workspace.id, projectId: block.project_id, taskId: block.task_id, agentId: agent.id, trigger: 'prompt_block', triggerRefId: blockId, dispatchedBy: user.id },
        effects,
      );
      await this.runs.setPromptBlockStatus(tx, blockId, 'running', r.id, userActor(user), effects);
      return r;
    });
    await effects.run();
    return { run_id: run.id, status: run.status };
  }

  // ================= Core =================

  /** Menjalankan operasi untuk user + efek samping standar (real-time, activity, notifikasi mention). */
  private async execute(user: AuthUser, scope: BlockScope, ops: BlockOperation[], clientId: string | null): Promise<ApplyResult> {
    const actor = userActor(user);
    const effects = new AfterCommit();
    const result = await this.prisma.tx((tx) => this.applyOperations(tx, scope, ops, actor, { requireVersionForUpdate: true }, effects));
    effects.add(() => this.emitChanges(scope, result, actor, clientId));
    if (scope.taskId && (result.upserted.length || result.deletedIds.length)) {
      const taskId = scope.taskId;
      effects.add(async () => {
        if (await this.activity.acquireThrottle(`content:${user.id}:${taskId}`, 600)) {
          const fx = new AfterCommit();
          await this.activity.log(
            this.prisma,
            {
              workspaceId: scope.workspaceId,
              projectId: scope.projectId,
              entityType: 'task',
              entityId: taskId,
              action: 'task.content_edited',
              actor,
              metadata: { block_count: result.upserted.length + result.deletedIds.length },
            },
            fx,
          );
          await fx.run();
        }
      });
    }
    if (result.newUserMentions.length) {
      effects.add(async () => {
        const fx = new AfterCommit();
        await this.notifications.notify(
          this.prisma,
          {
            recipients: result.newUserMentions,
            workspaceId: scope.workspaceId,
            type: 'comment_mention',
            title: `${user.display_name} menyebut Anda di dokumen ${scope.title}`,
            projectId: scope.projectId,
            entityType: scope.taskId ? 'task' : 'project',
            entityId: scope.taskId ?? scope.projectId,
            actor,
          },
          fx,
        );
        await fx.run();
      });
    }
    await effects.run();
    return result;
  }

  async emitChanges(scope: BlockScope, result: ApplyResult, actor: Actor, clientId: string | null): Promise<void> {
    const meta = { actor, originClientId: clientId };
    if (result.upserted.length) {
      this.realtime.toTaskOrProject(scope.projectId, scope.taskId, RealtimeEvent.BLOCK_UPSERTED, {
        task_id: scope.taskId,
        project_id: scope.projectId,
        blocks: await this.toDtos(result.upserted),
      }, meta);
    }
    if (result.deletedIds.length) {
      this.realtime.toTaskOrProject(scope.projectId, scope.taskId, RealtimeEvent.BLOCK_DELETED, {
        task_id: scope.taskId,
        project_id: scope.projectId,
        block_ids: result.deletedIds,
      }, meta);
    }
  }

  /**
   * Inti operasi blok (dipakai API batch & webhook agent):
   * validasi schema → sanitasi mention → cek scope/parent → optimistic locking → normalisasi urutan.
   */
  async applyOperations(tx: Tx, scope: BlockScope, ops: BlockOperation[], actor: Actor, opts: ApplyOptions, _effects?: AfterCommit): Promise<ApplyResult> {
    // 1. Validasi schema per operasi
    const normalized = new Map<number, { blockType?: string; content?: BlockContent }>();
    const issues: { operation_index: number; path: string; message: string }[] = [];
    ops.forEach((op, i) => {
      if (op.op !== 'upsert') return;
      if (op.block.block_type === undefined && op.mode !== 'update') {
        issues.push({ operation_index: i, path: 'block_type', message: 'block_type wajib diisi' });
        return;
      }
      normalized.set(i, { blockType: op.block.block_type });
    });

    const ids = [...new Set(ops.map((o) => (o.op === 'delete' ? o.id : o.block.id)))];
    const existingRows = ids.length ? await tx.document_blocks.findMany({ where: { id: { in: ids } } }) : [];
    const existing = new Map(existingRows.map((b) => [b.id, b]));

    for (const row of existingRows) {
      if (row.project_id !== scope.projectId || row.task_id !== scope.taskId) {
        throw Errors.validation('Blok bukan milik dokumen ini', { block_id: row.id });
      }
    }

    ops.forEach((op, i) => {
      if (op.op !== 'upsert' || !normalized.has(i)) return;
      const blockType = op.block.block_type ?? existing.get(op.block.id)?.block_type;
      if (!blockType) {
        issues.push({ operation_index: i, path: 'block.id', message: 'Blok tidak ditemukan' });
        return;
      }
      const res = validateBlockContent(blockType, op.block.content_json);
      if (!res.ok) res.issues.forEach((iss) => issues.push({ operation_index: i, ...iss }));
      else normalized.set(i, { blockType, content: res.content });
    });
    if (issues.length) throw Errors.validation('Konten blok tidak valid', { issues });

    // 2. Sanitasi mention: hanya member/agent workspace yang valid
    const mentionRefs = [...normalized.values()].flatMap((n) => (n.content ? extractMentions(n.content) : []));
    const validMentions = await this.validMentionSet(tx, scope.workspaceId, mentionRefs);
    for (const [i, n] of normalized) {
      if (n.content) normalized.set(i, { ...n, content: replaceInvalidMentions(n.content, (m) => validMentions.has(`${m.mention_type}:${m.id}`)) });
    }

    // 3. Validasi parent (harus ada di dokumen yang sama atau dibuat di batch ini)
    const batchIds = new Set(ops.filter((o) => o.op === 'upsert').map((o) => (o as { block: { id: string } }).block.id));
    const parentIds = [
      ...new Set(
        ops.flatMap((o) => (o.op === 'upsert' && o.block.parent_block_id ? [o.block.parent_block_id] : [])).filter((p) => !batchIds.has(p) || existing.has(p)),
      ),
    ];
    if (parentIds.length) {
      const parents = await tx.document_blocks.count({ where: { id: { in: parentIds }, project_id: scope.projectId, task_id: scope.taskId, deleted_at: null } });
      if (parents !== parentIds.length) throw Errors.validation('parent_block_id tidak ditemukan di dokumen ini');
    }
    for (const o of ops) {
      if (o.op === 'upsert' && o.block.parent_block_id === o.block.id) throw Errors.validation('Blok tidak dapat menjadi parent dirinya sendiri');
    }

    // 4. Urutkan: parent yang dibuat di batch ini diproses lebih dulu
    const order = this.topologicalOrder(ops);

    const result: ApplyResult = { applied: [], conflicts: [], upserted: [], deletedIds: [], newUserMentions: [] };
    const touchedParents = new Set<string | null>();
    const now = new Date();

    for (const i of order) {
      const op = ops[i];
      if (op.op === 'delete') {
        const row = existing.get(op.id);
        if (!row || row.deleted_at) continue; // idempotent
        if (op.expected_version !== undefined && op.expected_version !== row.version) {
          result.conflicts.push({ id: row.id, server_version: row.version, server_block: row });
          continue;
        }
        const subtree = await tx.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE sub AS (
            SELECT id FROM document_blocks WHERE id = ${row.id}::uuid
            UNION ALL
            SELECT b.id FROM document_blocks b JOIN sub ON b.parent_block_id = sub.id WHERE b.deleted_at IS NULL
          ) SELECT id::text AS id FROM sub`;
        const subtreeIds = subtree.map((s) => s.id);
        await tx.document_blocks.updateMany({ where: { id: { in: subtreeIds } }, data: { deleted_at: now } });
        result.deletedIds.push(...subtreeIds);
        touchedParents.add(row.parent_block_id);
        continue;
      }

      const n = normalized.get(i)!;
      const content = n.content!;
      const plain = extractPlainText(n.blockType!, content);
      const row = existing.get(op.block.id);
      const editor = { last_edited_by_type: actor.type, last_edited_by_id: actor.id };

      if (row) {
        if (op.mode === 'insert' || row.deleted_at) {
          result.conflicts.push({ id: row.id, server_version: row.deleted_at ? null : row.version, server_block: row.deleted_at ? null : row });
          continue;
        }
        if (op.expected_version === undefined && opts.requireVersionForUpdate) {
          throw Errors.validation('expected_version wajib untuk mengubah blok yang sudah ada', { operation_index: i, block_id: row.id });
        }
        if (op.expected_version !== undefined && op.expected_version !== row.version) {
          result.conflicts.push({ id: row.id, server_version: row.version, server_block: row });
          continue;
        }
        const parentId = op.block.parent_block_id === undefined ? row.parent_block_id : op.block.parent_block_id;
        const updated = await tx.document_blocks.update({
          where: { id: row.id },
          data: {
            block_type: n.blockType,
            content_json: content as unknown as Prisma.InputJsonValue,
            plain_text: plain,
            parent_block_id: parentId,
            order_index: op.block.order_index ?? row.order_index,
            version: { increment: 1 },
            ...editor,
          },
        });
        const before = new Set(extractMentions(row.content_json as unknown as BlockContent).map((m) => `${m.mention_type}:${m.id}`));
        result.newUserMentions.push(
          ...extractMentions(content)
            .filter((m) => m.mention_type === 'user' && !before.has(`user:${m.id}`))
            .map((m) => m.id),
        );
        touchedParents.add(row.parent_block_id);
        touchedParents.add(parentId);
        result.upserted.push(updated);
        result.applied.push({ id: updated.id, version: updated.version });
        continue;
      }

      if (op.mode === 'update') throw Errors.validation('Blok yang akan diubah tidak ditemukan', { operation_index: i, block_id: op.block.id });

      // Insert baru
      let parentId = op.block.parent_block_id ?? null;
      let orderIndex = op.block.order_index;
      if (orderIndex === undefined) {
        if (op.after_block_id) {
          const after = await tx.document_blocks.findFirst({
            where: { id: op.after_block_id, project_id: scope.projectId, task_id: scope.taskId, deleted_at: null },
          });
          if (!after) throw Errors.validation('after_block_id tidak ditemukan di dokumen ini', { operation_index: i });
          if (op.block.parent_block_id === undefined) parentId = after.parent_block_id;
          await tx.document_blocks.updateMany({
            where: { project_id: scope.projectId, task_id: scope.taskId, parent_block_id: parentId, deleted_at: null, order_index: { gt: after.order_index } },
            data: { order_index: { increment: 1 } },
          });
          orderIndex = after.order_index + 1;
        } else {
          const max = await tx.document_blocks.aggregate({
            where: { project_id: scope.projectId, task_id: scope.taskId, parent_block_id: parentId, deleted_at: null },
            _max: { order_index: true },
          });
          orderIndex = (max._max.order_index ?? -1) + 1;
        }
      }
      const created = await tx.document_blocks.create({
        data: {
          id: op.block.id,
          project_id: scope.projectId,
          task_id: scope.taskId,
          parent_block_id: parentId,
          block_type: n.blockType!,
          content_json: content as unknown as Prisma.InputJsonValue,
          plain_text: plain,
          order_index: orderIndex,
          ...editor,
        },
      });
      result.newUserMentions.push(...extractMentions(content).filter((m) => m.mention_type === 'user').map((m) => m.id));
      touchedParents.add(parentId);
      result.upserted.push(created);
      result.applied.push({ id: created.id, version: created.version });
    }

    // 5. Normalisasi order_index (0..n) untuk parent yang tersentuh
    for (const parentId of touchedParents) await this.normalizeOrder(tx, scope, parentId);
    if (touchedParents.size && result.upserted.length) {
      const fresh = await tx.document_blocks.findMany({ where: { id: { in: result.upserted.map((b) => b.id) } } });
      const byId = new Map(fresh.map((b) => [b.id, b]));
      result.upserted = result.upserted.map((b) => byId.get(b.id) ?? b);
    }
    result.newUserMentions = [...new Set(result.newUserMentions)].filter((id) => validMentions.has(`user:${id}`) && id !== actor.id);
    return result;
  }

  // ================= Helpers =================

  async resolveScope(user: AuthUser, projectId: string, taskId: string | null, minRole: workspace_role): Promise<BlockScope> {
    if (taskId) {
      const { task, workspace } = await this.access.assertTask(user.id, taskId, minRole);
      if (task.project_id !== projectId) throw Errors.validation('task_id tidak berada di project_id tersebut');
      return { workspaceId: workspace.id, projectId, taskId, title: task.title };
    }
    const { workspace, project } = await this.access.assertProject(user.id, projectId, minRole);
    return { workspaceId: workspace.id, projectId, taskId: null, title: project.title };
  }

  private async scopeFrom(workspaceId: string, projectId: string, projectTitle: string, taskId: string | null): Promise<BlockScope> {
    if (!taskId) return { workspaceId, projectId, taskId: null, title: projectTitle };
    const task = await this.prisma.tasks.findUnique({ where: { id: taskId }, select: { title: true } });
    return { workspaceId, projectId, taskId, title: task?.title ?? projectTitle };
  }

  private async normalizeOrder(tx: Tx, scope: BlockScope, parentId: string | null): Promise<void> {
    await tx.$executeRaw`
      UPDATE document_blocks AS d SET order_index = s.rn
      FROM (
        SELECT id, (row_number() OVER (ORDER BY order_index, created_at, id) - 1)::int AS rn
        FROM document_blocks
        WHERE project_id = ${scope.projectId}::uuid
          AND task_id IS NOT DISTINCT FROM ${scope.taskId}::uuid
          AND parent_block_id IS NOT DISTINCT FROM ${parentId}::uuid
          AND deleted_at IS NULL
      ) AS s
      WHERE d.id = s.id AND d.order_index <> s.rn`;
  }

  private async validMentionSet(tx: Tx, workspaceId: string, refs: { mention_type: 'user' | 'agent'; id: string }[]): Promise<Set<string>> {
    const userIds = [...new Set(refs.filter((r) => r.mention_type === 'user').map((r) => r.id))];
    const agentIds = [...new Set(refs.filter((r) => r.mention_type === 'agent').map((r) => r.id))];
    const set = new Set<string>();
    if (userIds.length) {
      const m = await tx.workspace_members.findMany({ where: { workspace_id: workspaceId, user_id: { in: userIds } }, select: { user_id: true } });
      m.forEach((x) => set.add(`user:${x.user_id}`));
    }
    if (agentIds.length) {
      const a = await tx.agents.findMany({ where: { workspace_id: workspaceId, id: { in: agentIds }, deleted_at: null }, select: { id: true } });
      a.forEach((x) => set.add(`agent:${x.id}`));
    }
    return set;
  }

  /** Indeks operasi terurut sehingga blok parent yang dibuat di batch yang sama diproses lebih dulu. */
  private topologicalOrder(ops: BlockOperation[]): number[] {
    const idx = new Map<string, number>();
    ops.forEach((o, i) => o.op === 'upsert' && idx.set(o.block.id, i));
    const visited = new Set<number>();
    const out: number[] = [];
    const visit = (i: number, stack: Set<number>) => {
      if (visited.has(i) || stack.has(i)) return;
      stack.add(i);
      const o = ops[i];
      if (o.op === 'upsert' && o.block.parent_block_id) {
        const p = idx.get(o.block.parent_block_id);
        if (p !== undefined) visit(p, stack);
      }
      visited.add(i);
      out.push(i);
    };
    ops.forEach((_, i) => visit(i, new Set()));
    return out;
  }
}
