import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import {
  browserLoginJobIdSchema,
  browserLoginStartSchema,
  browserProfileNameSchema,
  createBrowserProfileSchema,
} from '../../shared/schemas/browser-profile.schema';
import { IntelBrowserService } from './intel-browser.service';

@ApiTags('Intel — Profil browser')
@ApiBearerAuth()
@Controller('workspaces/:ws/intel')
export class IntelBrowserController {
  constructor(private readonly browser: IntelBrowserService) {}

  @Get('browser-profiles')
  list(@CurrentUser() user: AuthUser, @Param('ws', UuidPipe) ws: string, @Headers('x-request-id') requestId?: string) {
    return this.browser.list(user, ws, requestId);
  }

  @Post('browser-profiles')
  @ApiZodBody(createBrowserProfileSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Body(new ZodPipe(createBrowserProfileSchema)) body: z.infer<typeof createBrowserProfileSchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.browser.create(user, ws, body, requestId);
  }

  @Post('browser-profiles/:name/login')
  @HttpCode(202)
  @ApiZodBody(browserLoginStartSchema)
  startLogin(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('name', new ZodPipe(browserProfileNameSchema)) name: string,
    @Body(new ZodPipe(browserLoginStartSchema)) body: z.infer<typeof browserLoginStartSchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.browser.startLogin(user, ws, name, body, requestId);
  }

  @Get('browser-logins/:jobId')
  getLogin(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('jobId', new ZodPipe(browserLoginJobIdSchema)) jobId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.browser.getLogin(user, ws, jobId, requestId);
  }

  @Post('browser-logins/:jobId/cancel')
  @HttpCode(200)
  cancelLogin(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('jobId', new ZodPipe(browserLoginJobIdSchema)) jobId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.browser.cancelLogin(user, ws, jobId, requestId);
  }
}
