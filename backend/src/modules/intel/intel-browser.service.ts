import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../../common/types/request.types';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/exceptions/app.exception';
import {
  browserLoginSchema,
  browserLoginStartSchema,
  browserProfileSchema,
  browserProfilesSchema,
  createBrowserProfileSchema,
} from '../../shared/schemas/browser-profile.schema';
import { AccessService } from '../core/access.service';
import { IntelMcpClient } from './intel-mcp-client.service';

/**
 * Profil Chrome MCP untuk scraping + login manual (akun Google dkk.) dari Dashboard.
 * Profil berlaku untuk seluruh MCP (mesin yang sama), jadi hanya Admin/Owner workspace.
 * Password tidak pernah melewati Dashboard: login dilakukan di jendela Chrome pada mesin MCP.
 */
@Injectable()
export class IntelBrowserService {
  constructor(
    private readonly config: AppConfigService,
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
  ) {}

  async list(user: AuthUser, workspaceId: string, requestId?: string) {
    await this.guard(user, workspaceId);
    return this.mcp.call('intel_browser_profiles', {}, browserProfilesSchema, requestId);
  }

  async create(user: AuthUser, workspaceId: string, input: z.infer<typeof createBrowserProfileSchema>, requestId?: string) {
    await this.guard(user, workspaceId);
    return this.mcp.call('intel_browser_profile_create', input, browserProfileSchema, requestId);
  }

  async startLogin(user: AuthUser, workspaceId: string, profile: string, input: z.infer<typeof browserLoginStartSchema>, requestId?: string) {
    await this.guard(user, workspaceId);
    return this.mcp.call('intel_browser_login_start', { profile, sites: input.sites }, browserLoginSchema, requestId);
  }

  async getLogin(user: AuthUser, workspaceId: string, jobId: string, requestId?: string) {
    await this.guard(user, workspaceId);
    return this.mcp.call('intel_browser_login_get', { job_id: jobId }, browserLoginSchema, requestId);
  }

  async cancelLogin(user: AuthUser, workspaceId: string, jobId: string, requestId?: string) {
    await this.guard(user, workspaceId);
    return this.mcp.call('intel_browser_login_cancel', { job_id: jobId }, browserLoginSchema, requestId);
  }

  private async guard(user: AuthUser, workspaceId: string) {
    if (!this.config.isIntelEnabled) throw new AppException('FEATURE_DISABLED', 'Modul Intel belum diaktifkan', 503);
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
  }
}
