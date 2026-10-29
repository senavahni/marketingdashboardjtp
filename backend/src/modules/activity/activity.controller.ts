import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { paginationQuery } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import { ActivityService } from './activity.service';

const query = paginationQuery(50, 200);

@ApiTags('Activity')
@ApiBearerAuth()
@Controller()
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly access: AccessService,
  ) {}

  @Get('projects/:id/activity')
  @ApiZodQuery(query)
  async project(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Query(new ZodPipe(query)) q: { limit: number; cursor?: string }) {
    await this.access.assertProject(user.id, id);
    return this.activity.listForProject(id, q.limit, q.cursor);
  }

  @Get('tasks/:id/activity')
  @ApiZodQuery(query)
  async task(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Query(new ZodPipe(query)) q: { limit: number; cursor?: string }) {
    await this.access.assertTask(user.id, id);
    return this.activity.listForTask(id, q.limit, q.cursor);
  }
}
