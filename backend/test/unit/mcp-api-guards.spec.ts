import { ExecutionContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '../../src/config/app-config.service';
import { PrismaService } from '../../src/database/prisma.service';
import { McpAgentGuard } from '../../src/common/guards/mcp-agent.guard';
import { McpServiceTokenGuard } from '../../src/common/guards/mcp-service-token.guard';
import { McpApiController } from '../../src/modules/mcp-api/mcp-api.controller';
import { McpApiService } from '../../src/modules/mcp-api/mcp-api.service';

@Module({
  controllers: [McpApiController],
  providers: [
    { provide: McpApiService, useValue: {} },
    { provide: AppConfigService, useValue: { env: { MCP_SERVICE_TOKEN: 'token' } } },
    { provide: PrismaService, useValue: { agents: { findFirst: jest.fn() } } },
  ],
})
class McpSwaggerTestModule {}

function createContext(
  request: { header(name: string): string | undefined; mcpAgent?: unknown },
  response: { setHeader(name: string, value: string): void },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

describe('MCP Service API guards', () => {
  it('rejects invalid service tokens', () => {
    const guard = new McpServiceTokenGuard({
      env: { MCP_SERVICE_TOKEN: 'expected-token' },
    } as AppConfigService);
    const context = createContext({ header: () => 'Bearer wrong-token' }, { setHeader: jest.fn() });

    expect(() => guard.canActivate(context)).toThrow();
  });

  it('accepts valid service tokens', () => {
    const guard = new McpServiceTokenGuard({
      env: { MCP_SERVICE_TOKEN: 'expected-token' },
    } as AppConfigService);
    const context = createContext({ header: () => 'Bearer expected-token' }, { setHeader: jest.fn() });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects malformed or inactive agent headers', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const guard = new McpAgentGuard({
      agents: { findFirst },
    } as unknown as PrismaService);
    const response = { setHeader: jest.fn() };
    const malformed = createContext({ header: () => 'not-a-uuid' }, response);
    const inactive = createContext({ header: () => '00000000-0000-4000-8000-000000000001' }, response);

    await expect(guard.canActivate(malformed)).rejects.toThrow();
    expect(findFirst).not.toHaveBeenCalled();
    await expect(guard.canActivate(inactive)).rejects.toThrow();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('attaches the agent and contract version for an active agent', async () => {
    const agent = {
      id: '00000000-0000-4000-8000-000000000001',
      workspace_id: '00000000-0000-4000-8000-000000000002',
      name: 'MCP Assistant',
      handle: 'mcp-assistant',
    };
    const findFirst = jest.fn().mockResolvedValue(agent);
    const guard = new McpAgentGuard({
      agents: { findFirst },
    } as unknown as PrismaService);
    const request = { header: () => agent.id };
    const response = { setHeader: jest.fn() };

    await expect(guard.canActivate(createContext(request, response))).resolves.toBe(true);
    expect(request).toHaveProperty('mcpAgent', agent);
    expect(response.setHeader).toHaveBeenCalledWith('X-Contract-Version', '1.1');
  });

  it('publishes MCP Service API routes and schemas in the Swagger document', async () => {
    const app = await NestFactory.create(McpSwaggerTestModule);
    try {
      app.setGlobalPrefix('api/v1');
      const config = new DocumentBuilder().setTitle('MCP API').addBearerAuth().build();
      const document = SwaggerModule.createDocument(app, config);

      expect(document.paths).toHaveProperty('/api/v1/mcp-api/workspaces/{workspaceId}/projects');
      expect(document.paths).toHaveProperty('/api/v1/mcp-api/projects/{projectId}/tasks');
      expect(document.paths).toHaveProperty('/api/v1/mcp-api/tasks/{taskId}/reschedule');
      expect(document.paths).toHaveProperty('/api/v1/mcp-api/blocks/ops');
      expect(document.paths).toHaveProperty('/api/v1/mcp-api/comments');
      expect(document.paths['/api/v1/mcp-api/comments']?.post?.tags).toContain('MCP Service API (contract 1.1)');
      expect(document.paths['/api/v1/mcp-api/comments']?.post?.security).toEqual([{ bearer: [] }]);
    } finally {
      await app.close();
    }
  });
});
