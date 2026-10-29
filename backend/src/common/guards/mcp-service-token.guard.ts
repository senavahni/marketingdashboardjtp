import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { safeEqual } from '../../utils/helpers/crypto.util';
import { Errors } from '../exceptions/app.exception';
import { AppRequest } from '../types/request.types';

/** Autentikasi Agent API (MCP Server → Dashboard) dengan Bearer MCP_SERVICE_TOKEN. */
@Injectable()
export class McpServiceTokenGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<AppRequest>().header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || !safeEqual(token, this.config.env.MCP_SERVICE_TOKEN)) throw Errors.unauthenticated('Service token tidak valid');
    return true;
  }
}
