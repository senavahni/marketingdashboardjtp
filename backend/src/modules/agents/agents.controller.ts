import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { createAgentSchema, listAgentsQuery, updateAgentSchema } from './agents.schemas';
import { AgentsService } from './agents.service';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller()
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get('workspaces/:workspaceId/agents')
  @ApiZodQuery(listAgentsQuery)
  list(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Query(new ZodPipe(listAgentsQuery)) q: z.infer<typeof listAgentsQuery>) {
    return this.agents.list(user, id, q.include_inactive ?? false);
  }

  @Post('workspaces/:workspaceId/agents')
  @ApiZodBody(createAgentSchema)
  create(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Body(new ZodPipe(createAgentSchema)) body: z.infer<typeof createAgentSchema>) {
    return this.agents.create(user, id, body);
  }

  @Patch('agents/:agentId')
  @ApiZodBody(updateAgentSchema)
  update(@CurrentUser() user: AuthUser, @Param('agentId', UuidPipe) id: string, @Body(new ZodPipe(updateAgentSchema)) body: z.infer<typeof updateAgentSchema>) {
    return this.agents.update(user, id, body);
  }

  @Delete('agents/:agentId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('agentId', UuidPipe) id: string) {
    await this.agents.remove(user, id);
  }
}
