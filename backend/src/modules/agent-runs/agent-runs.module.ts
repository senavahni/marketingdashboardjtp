import { Global, Module } from '@nestjs/common';
import { AgentRunsService } from './agent-runs.service';
import { McpClientService } from './mcp-client.service';
import { McpOutboundWorker } from './mcp-outbound.worker';
import { McpPayloadBuilder } from './mcp-payload.builder';
import { McpQueueService } from './mcp-queue.service';
import { RunMaintenanceService } from './run-maintenance.service';

@Global()
@Module({
  providers: [AgentRunsService, McpClientService, McpQueueService, McpPayloadBuilder, McpOutboundWorker, RunMaintenanceService],
  exports: [AgentRunsService, McpPayloadBuilder],
})
export class AgentRunsModule {}
