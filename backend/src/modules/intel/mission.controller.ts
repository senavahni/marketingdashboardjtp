import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { createMissionSchema, missionResumeSchema, missionReviseSchema, missionsQuerySchema } from '../../shared/schemas/mission.schema';
import { IntelService } from './intel.service';
import { MissionService } from './mission.service';

@ApiTags('Missions')
@ApiBearerAuth()
@Controller()
export class MissionController {
  constructor(
    private readonly missions: MissionService,
    private readonly intel: IntelService,
  ) {}

  @Get('workspaces/:ws/missions')
  list(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Query(new ZodPipe(missionsQuerySchema)) query: z.infer<typeof missionsQuerySchema>,
  ) {
    return this.missions.list(user, ws, query);
  }

  @Post('workspaces/:ws/missions')
  @HttpCode(201)
  @ApiZodBody(createMissionSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Body(new ZodPipe(createMissionSchema)) body: z.infer<typeof createMissionSchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.createMission(user, ws, body, requestId);
  }

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

  @Post('missions/:id/pause')
  @HttpCode(200)
  pause(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.missions.pause(user, id);
  }

  @Post('missions/:id/resume')
  @HttpCode(200)
  @ApiZodBody(missionResumeSchema)
  resume(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(missionResumeSchema)) body: z.infer<typeof missionResumeSchema>) {
    return this.missions.resume(user, id, body.extra_runs, body.extra_budget_usd);
  }

  @Post('missions/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.missions.cancel(user, id);
  }
}
