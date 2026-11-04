import { Module } from '@nestjs/common';
import { IntelModule } from '../intel/intel.module';
import { McpWebhookService } from './mcp-webhook.service';
import { WebhooksController } from './webhooks.controller';

@Module({ imports: [IntelModule], controllers: [WebhooksController], providers: [McpWebhookService] })
export class WebhooksModule {}
