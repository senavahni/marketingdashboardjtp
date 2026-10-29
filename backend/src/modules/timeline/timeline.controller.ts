import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { ClientId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { rescheduleSchema, timelineQuery } from './timeline.schemas';
import { TimelineService } from './timeline.service';

@ApiTags('Timeline')
@ApiBearerAuth()
@Controller()
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get('projects/:id/timeline')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Query(new ZodPipe(timelineQuery)) q: z.infer<typeof timelineQuery>) {
    return this.timeline.timeline(user, id, q.from, q.to);
  }

  @Patch('tasks/:id/reschedule')
  @ApiZodBody(rescheduleSchema)
  reschedule(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(rescheduleSchema)) body: z.infer<typeof rescheduleSchema>,
  ) {
    return this.timeline.reschedule(user, id, body, clientId);
  }
}
