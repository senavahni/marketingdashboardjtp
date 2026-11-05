import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ZodType } from 'zod';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/exceptions/app.exception';
import { McpCallError } from '../agent-runs/mcp-client.service';
import { mapIntelMcpError } from './intel-mcp.errors';
import { redactGatewayKeys } from './intel-sanitizer';

export type IntelToolName =
  | 'intel_agents_list'
  | 'intel_sources_status'
  | 'intel_job_estimate'
  | 'intel_job_create'
  | 'intel_job_get'
  | 'intel_job_cancel'
  | 'intel_job_purge_index'
  | 'intel_kb_projection'
  | 'intel_items'
  | 'intel_llm_status'
  | 'intel_mission_plan'
  | 'intel_browser_profiles'
  | 'intel_browser_profile_create'
  | 'intel_browser_login_start'
  | 'intel_browser_login_get'
  | 'intel_browser_login_cancel';

const TOOL_TIMEOUT_MS = 15_000;

@Injectable()
export class IntelMcpClient {
  private readonly logger = new Logger(IntelMcpClient.name);

  constructor(private readonly config: AppConfigService) {}

  async call<T>(
    tool: IntelToolName,
    args: Record<string, unknown>,
    schema: ZodType<T>,
    requestId?: string,
    timeoutMs = TOOL_TIMEOUT_MS,
  ): Promise<T> {
    const apiKey = this.config.env.MCP_INTEL_API_KEY;
    if (!apiKey) {
      throw new AppException('FEATURE_DISABLED', 'Modul Intel belum diaktifkan', 503);
    }

    const client = new Client({ name: 'dashboard-intel', version: '0.1.0' });
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (requestId && requestId.length <= 128) headers['X-Request-Id'] = requestId;
    const transport = new StreamableHTTPClientTransport(new URL(this.config.env.MCP_SERVER_URL), {
      requestInit: { headers },
    });
    const started = Date.now();
    try {
      await client.connect(transport, { timeout: TOOL_TIMEOUT_MS });
      const response = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: timeoutMs });
      const result = response.structuredContent ?? this.parseTextContent(response.content);
      if (response.isError) {
        const error = result as { code?: unknown; message?: unknown; retryable?: unknown } | undefined;
        throw new McpCallError(
          typeof error?.code === 'string' ? error.code : 'MCP_ERROR',
          typeof error?.message === 'string' ? error.message : 'MCP tool mengembalikan error',
          error?.retryable === true,
        );
      }
      const parsed = schema.safeParse(result);
      if (!parsed.success) throw new McpCallError('MCP_ERROR', 'Respons MCP tidak sesuai kontrak', false);
      this.logger.debug({ tool, ms: Date.now() - started }, 'Intel MCP tool call sukses');
      return redactGatewayKeys(parsed.data);
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (error instanceof McpCallError) throw mapIntelMcpError(error);
      throw mapIntelMcpError(new McpCallError('MCP_UNAVAILABLE', 'Layanan MCP tidak tersedia', true));
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private parseTextContent(content: unknown): unknown {
    if (!Array.isArray(content)) return undefined;
    const text = content.find((part: { type?: string }) => part?.type === 'text') as { text?: string } | undefined;
    if (!text?.text) return undefined;
    try {
      return JSON.parse(text.text);
    } catch {
      return undefined;
    }
  }
}
