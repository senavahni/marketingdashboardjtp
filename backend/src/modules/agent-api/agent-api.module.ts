import { Module } from '@nestjs/common';
import { AgentApiController } from './agent-api.controller';
import { AgentApiService } from './agent-api.service';

@Module({ controllers: [AgentApiController], providers: [AgentApiService] })
export class AgentApiModule {}
