import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AppConfigService } from './config/app-config.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AgentApiModule } from './modules/agent-api/agent-api.module';
import { AgentRunsModule } from './modules/agent-runs/agent-runs.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CoreModule } from './modules/core/core.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { RedisModule } from './redis/redis.module';
import { buildLoggerParams } from './utils/logger/logger.config';

@Module({
  imports: [
    // Infrastruktur
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [AppConfigService], useFactory: (config: AppConfigService) => buildLoggerParams(config.env) }),
    DatabaseModule,
    RedisModule,
    // Layanan bersama
    AuthModule,
    CoreModule,
    RealtimeModule,
    ActivityModule,
    NotificationsModule,
    AgentRunsModule,
    // Fitur (TASK_002)
    WorkspacesModule,
    AgentsModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    // Fitur (TASK_003)
    BlocksModule,
    TimelineModule,
    WebhooksModule,
    AgentApiModule,
    HealthModule,
  ],
  providers: [
    // Urutan guard: autentikasi dulu, lalu rate limit (agar key bisa per user)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
