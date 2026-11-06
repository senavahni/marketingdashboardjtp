import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { AppConfigService } from '../../config/app-config.service';
import { llmKeyRotateResultSchema } from '../../shared/schemas/llm-key.schema';
import { AccessService } from '../core/access.service';
import { IntelMcpClient } from './intel-mcp-client.service';

const ROTATE_TIMEOUT_MS = 30_000;

/**
 * Rotasi key LLM Gateway per agent (M3_TASK_009 P1). Key berlaku untuk seluruh MCP, jadi hanya
 * Admin/Owner workspace. Key lengkap tidak pernah melewati Dashboard: MCP hanya mengembalikan prefix.
 */
@Injectable()
export class IntelLlmKeysService {
  private readonly logger = new Logger(IntelLlmKeysService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
  ) {}

  async rotate(user: AuthUser, workspaceId: string, agentKey: string, requestId?: string) {
    if (!this.config.isIntelEnabled) throw new AppException(ErrorCode.FEATURE_DISABLED, 'Modul Intel belum diaktifkan', 503);
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    try {
      const result = await this.mcp.call(
        'intel_llm_key_rotate',
        { agent_key: agentKey },
        llmKeyRotateResultSchema,
        requestId,
        ROTATE_TIMEOUT_MS,
      );
      this.logger.log(
        { user_id: user.id, workspace_id: workspaceId, agent_key: agentKey, key_prefix: result.key_prefix },
        'Key LLM Gateway dirotasi',
      );
      return result;
    } catch (error) {
      // pesan umum "Model LLM gagal menjawab" menyesatkan untuk kegagalan Admin API Gateway
      if (error instanceof AppException && error.code === ErrorCode.LLM_ERROR) {
        throw new AppException(
          ErrorCode.LLM_ERROR,
          'LLM Gateway tidak dapat menerbitkan key baru. Periksa admin key Gateway di .env MCP dan pastikan Gateway berjalan',
          error.getStatus(),
        );
      }
      throw error;
    }
  }
}
