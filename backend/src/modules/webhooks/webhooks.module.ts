import { Module } from '@nestjs/common';
import { McpWebhookService } from './mcp-webhook.service';
import { WebhooksController } from './webhooks.controller';

@Module({ controllers: [WebhooksController], providers: [McpWebhookService] })
export class WebhooksModule {}
