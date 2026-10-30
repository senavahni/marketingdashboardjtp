import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppConfigService } from '../../config/app-config.service';
import { toolErrorSchema } from '../../shared/schemas/mcp.schema';

/** Error pemanggilan tool MCP; retryable menentukan apakah job di-retry. */
export class McpCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'McpCallError';
  }
}

export type McpToolName =
  | 'pm_dispatch_task_to_agent'
  | 'pm_request_agent_estimation'
  | 'pm_notify_agent_mention'
  | 'pm_execute_prompt_block'
  | 'pm_cancel_agent_run';

/** Klien MCP (Streamable HTTP) untuk memanggil tools di Custom MCP Server (M1_MCP_INTEGRATION §2–3). */
@Injectable()
export class McpClientService {
  private readonly logger = new Logger(McpClientService.name);

  constructor(private readonly config: AppConfigService) {}

  async callTool(name: McpToolName, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const client = new Client({ name: 'marketing-dashboard', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.config.env.MCP_SERVER_URL), {
      requestInit: { headers: { Authorization: `Bearer ${this.config.env.MCP_SERVER_API_KEY}` } },
    });
    const started = Date.now();
    try {
      await client.connect(transport, { timeout: timeoutMs });
      const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
      const structured = res.structuredContent ?? this.parseTextContent(res.content);
      if (res.isError) {
        const parsed = toolErrorSchema.safeParse(structured);
        throw new McpCallError(
          parsed.success ? parsed.data.code : 'TOOL_ERROR',
          (parsed.success ? parsed.data.message : undefined) ?? `Tool ${name} mengembalikan error`,
          parsed.success ? (parsed.data.retryable ?? false) : false,
        );
      }
      this.logger.debug({ tool: name, ms: Date.now() - started }, 'MCP tool call sukses');
      return structured;
    } catch (err) {
      if (err instanceof McpCallError) throw err;
      throw new McpCallError('MCP_UNAVAILABLE', `Gagal memanggil ${name}: ${(err as Error).message}`, true);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private parseTextContent(content: unknown): unknown {
    if (!Array.isArray(content)) return undefined;
    const text = content.find((c: { type?: string }) => c?.type === 'text') as { text?: string } | undefined;
    if (!text?.text) return undefined;
    try {
      return JSON.parse(text.text);
    } catch {
      return undefined;
    }
  }
}
