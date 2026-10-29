import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { tasks } from '../../generated/prisma/client';
import { toDateString } from '../../utils/helpers/date.util';
import { buildBlockTree, flattenBlockTree } from '../blocks/block.mapper';

const MAX_CONTEXT_BLOCKS = 200;
const MAX_CONTEXT_BYTES = 100_000;

export interface ContextBlock {
  id: string;
  parent_block_id: string | null;
  block_type: string;
  content_json: unknown;
  plain_text: string;
  version: number;
}

/** Menyusun payload standar untuk tools MCP (TaskSnapshot, ContextBlock, callback). */
@Injectable()
export class McpPayloadBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  taskSnapshot(task: tasks, workspaceId: string) {
    return {
      id: task.id,
      project_id: task.project_id,
      workspace_id: workspaceId,
      parent_task_id: task.parent_task_id,
      depth: task.depth,
      title: task.title,
      status: task.status,
      priority: task.priority,
      start_date: toDateString(task.start_date),
      end_date: toDateString(task.end_date),
      is_milestone: task.is_milestone,
      tags: task.tags,
      url: `${this.config.appBaseUrl}/w/${workspaceId}/p/${task.project_id}/t/${task.id}`,
    };
  }

  /** Blok task (atau Project Brief jika taskId null) dalam urutan dokumen, dibatasi 200 blok / 100 KB. */
  async contextBlocks(projectId: string, taskId: string | null): Promise<ContextBlock[]> {
    const rows = await this.prisma.document_blocks.findMany({
      where: { project_id: projectId, task_id: taskId, deleted_at: null },
      select: { id: true, parent_block_id: true, block_type: true, content_json: true, plain_text: true, version: true, order_index: true },
    });
    const ordered = flattenBlockTree(buildBlockTree(rows.map((r) => ({ ...r, children: [] as never[] }))));
    const out: ContextBlock[] = [];
    let bytes = 0;
    for (const b of ordered) {
      const item = { id: b.id, parent_block_id: b.parent_block_id, block_type: b.block_type, content_json: b.content_json, plain_text: b.plain_text, version: b.version };
      bytes += Buffer.byteLength(JSON.stringify(item));
      if (out.length >= MAX_CONTEXT_BLOCKS || bytes > MAX_CONTEXT_BYTES) break;
      out.push(item);
    }
    return out;
  }

  description(blocks: ContextBlock[]): string {
    return blocks
      .map((b) => b.plain_text)
      .filter(Boolean)
      .join('\n');
  }

  callback() {
    return {
      webhook_url: `${this.config.apiBaseUrl}/webhooks/mcp/events`,
      agent_api_base_url: `${this.config.apiBaseUrl}/agent-api`,
    };
  }
}
