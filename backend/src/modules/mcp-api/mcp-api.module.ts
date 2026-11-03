import { Module } from '@nestjs/common';
import { McpAgentGuard } from '../../common/guards/mcp-agent.guard';
import { BlocksModule } from '../blocks/blocks.module';
import { CommentsModule } from '../comments/comments.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimelineModule } from '../timeline/timeline.module';
import { McpApiController } from './mcp-api.controller';
import { McpApiService } from './mcp-api.service';

@Module({
  imports: [ProjectsModule, TasksModule, BlocksModule, CommentsModule, TimelineModule],
  controllers: [McpApiController],
  providers: [McpAgentGuard, McpApiService],
})
export class McpApiModule {}
