import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service';
import { Errors } from '../exceptions/app.exception';
import { AppRequest } from '../types/request.types';

const agentIdSchema = z.uuid();

@Injectable()
export class McpAgentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<{ setHeader(name: string, value: string): void }>();
    const rawId = request.header('x-mcp-agent-id');
    const parsedId = agentIdSchema.safeParse(rawId);
    if (!parsedId.success) throw Errors.unauthenticated('Header X-MCP-Agent-Id tidak valid');

    const agent = await this.prisma.agents.findFirst({
      where: { id: parsedId.data, is_active: true, deleted_at: null },
      select: { id: true, workspace_id: true, name: true, handle: true },
    });
    if (!agent) throw Errors.unauthenticated('Agent MCP tidak aktif');
    request.mcpAgent = agent;
    response.setHeader('X-Contract-Version', '1.1');
    return true;
  }
}
