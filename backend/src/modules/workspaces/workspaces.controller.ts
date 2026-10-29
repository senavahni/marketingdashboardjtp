import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import {
  addMemberSchema,
  assigneesQuery,
  createWorkspaceSchema,
  transferOwnershipSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
} from './workspaces.schemas';
import { WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces & Members')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.list(user);
  }

  @Post()
  @ApiZodBody(createWorkspaceSchema)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createWorkspaceSchema)) body: z.infer<typeof createWorkspaceSchema>) {
    return this.workspaces.create(user, body);
  }

  @Get(':workspaceId')
  get(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string) {
    return this.workspaces.get(user, id);
  }

  @Patch(':workspaceId')
  @ApiZodBody(updateWorkspaceSchema)
  update(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Body(new ZodPipe(updateWorkspaceSchema)) body: z.infer<typeof updateWorkspaceSchema>) {
    return this.workspaces.update(user, id, body);
  }

  @Get(':workspaceId/members')
  members(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string) {
    return this.workspaces.listMembers(user, id);
  }

  @Post(':workspaceId/members')
  @ApiZodBody(addMemberSchema)
  addMember(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Body(new ZodPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>) {
    return this.workspaces.addMember(user, id, body);
  }

  @Patch(':workspaceId/members/:userId')
  @ApiZodBody(updateMemberSchema)
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', UuidPipe) id: string,
    @Param('userId', UuidPipe) userId: string,
    @Body(new ZodPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>,
  ) {
    return this.workspaces.updateMember(user, id, userId, body.role);
  }

  @Delete(':workspaceId/members/:userId')
  @HttpCode(204)
  async removeMember(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Param('userId', UuidPipe) userId: string) {
    await this.workspaces.removeMember(user, id, userId);
  }

  @Post(':workspaceId/transfer-ownership')
  @HttpCode(200)
  @ApiZodBody(transferOwnershipSchema)
  transfer(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Body(new ZodPipe(transferOwnershipSchema)) body: z.infer<typeof transferOwnershipSchema>) {
    return this.workspaces.transferOwnership(user, id, body.user_id);
  }

  @Get(':workspaceId/assignees')
  @ApiZodQuery(assigneesQuery)
  assignees(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string, @Query(new ZodPipe(assigneesQuery)) q: z.infer<typeof assigneesQuery>) {
    return this.workspaces.assignees(user, id, q.q);
  }
}
