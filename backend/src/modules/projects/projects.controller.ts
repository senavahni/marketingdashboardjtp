import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { createProjectSchema, updateProjectSchema } from './projects.schemas';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('workspaces/:workspaceId/projects')
  list(@CurrentUser() user: AuthUser, @Param('workspaceId', UuidPipe) id: string) {
    return this.projects.list(user, id);
  }

  @Post('projects')
  @ApiZodBody(createProjectSchema)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createProjectSchema)) body: z.infer<typeof createProjectSchema>) {
    return this.projects.create(user, body);
  }

  @Get('projects/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.projects.get(user, id);
  }

  @Patch('projects/:id')
  @ApiZodBody(updateProjectSchema)
  update(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateProjectSchema)) body: z.infer<typeof updateProjectSchema>) {
    return this.projects.update(user, id, body);
  }

  @Delete('projects/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    await this.projects.remove(user, id);
  }
}
