import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { booleanQuery } from '../../shared/schemas/common.schema';
import { paginationQuery } from '../../utils/helpers/pagination.util';
import { NotificationsService } from './notifications.service';

const listQuery = paginationQuery(30, 100).extend({ unread_only: booleanQuery });

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiZodQuery(listQuery)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.notifications.list(user.id, q.unread_only ?? false, q.limit, q.cursor);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.readAll(user.id);
  }
}
