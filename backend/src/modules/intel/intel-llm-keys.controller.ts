import { Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { llmKeyAgentKeySchema } from '../../shared/schemas/llm-key.schema';
import { IntelLlmKeysService } from './intel-llm-keys.service';

@ApiTags('Intel — Key LLM')
@ApiBearerAuth()
@Controller('workspaces/:ws/intel/llm-keys')
export class IntelLlmKeysController {
  constructor(private readonly keys: IntelLlmKeysService) {}

  @Post(':agentKey/rotate')
  @HttpCode(200)
  rotate(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('agentKey', new ZodPipe(llmKeyAgentKeySchema)) agentKey: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.keys.rotate(user, ws, agentKey, requestId);
  }
}
