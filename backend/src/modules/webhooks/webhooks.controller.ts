import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { McpSignatureGuard } from '../../common/guards/mcp-signature.guard';
import { McpWebhookService } from './mcp-webhook.service';

@ApiTags('MCP Webhook')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: McpWebhookService) {}

  /** Satu endpoint untuk semua event agent (M1_MCP_INTEGRATION §5). */
  @Public()
  @RateLimit('webhook')
  @UseGuards(McpSignatureGuard)
  @Post('mcp/events')
  @HttpCode(200)
  @ApiHeader({ name: 'X-MCP-Timestamp', required: true })
  @ApiHeader({ name: 'X-MCP-Signature', required: true, description: 'sha256=<hex HMAC_SHA256(secret, "<timestamp>.<raw_body>")>' })
  receive(@Body() body: unknown) {
    return this.webhooks.handle(body);
  }
}
