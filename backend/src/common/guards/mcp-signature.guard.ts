import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { verifyMcpSignature } from '../../utils/helpers/crypto.util';
import { ErrorCode } from '../constants/error-codes';
import { Errors } from '../exceptions/app.exception';
import { AppRequest } from '../types/request.types';

/** Verifikasi HMAC webhook MCP (X-MCP-Timestamp & X-MCP-Signature, toleransi 300 detik). */
@Injectable()
export class McpSignatureGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const result = verifyMcpSignature({
      secrets: [this.config.env.MCP_WEBHOOK_SECRET, this.config.env.MCP_WEBHOOK_SECRET_PREVIOUS ?? ''],
      timestamp: req.header('x-mcp-timestamp'),
      signature: req.header('x-mcp-signature'),
      rawBody: req.rawBody,
    });
    if (result !== 'ok') {
      const message = result === 'expired' ? 'Timestamp webhook kedaluwarsa' : 'Signature webhook tidak valid';
      throw Errors.unauthenticated(message, ErrorCode.INVALID_SIGNATURE);
    }
    return true;
  }
}
