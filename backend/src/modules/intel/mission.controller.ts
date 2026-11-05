import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { missionReviseSchema } from '../../shared/schemas/mission.schema';
import { MissionService } from './mission.service';

@ApiTags('Missions')
@ApiBearerAuth()
@Controller()
export class MissionController {
  constructor(private readonly missions: MissionService) {}

  @Get('intel/jobs/:id/mission')
  forJob(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string) {
    return this.missions.forIntelJob(user, jobId);
  }

  @Get('missions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.missions.get(user, id);
  }

  @Post('missions/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.missions.approve(user, id);
  }

  @Post('missions/:id/revise')
  @HttpCode(200)
  @ApiZodBody(missionReviseSchema)
  revise(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(missionReviseSchema)) body: z.infer<typeof missionReviseSchema>) {
    return this.missions.revise(user, id, body.feedback);
  }

  @Post('missions/:id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.missions.retry(user, id);
  }

  @Post('missions/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.missions.cancel(user, id);
  }
}
