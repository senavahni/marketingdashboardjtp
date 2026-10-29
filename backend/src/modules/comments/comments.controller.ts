import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { ClientId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { createCommentSchema, listCommentsQuery, updateCommentSchema } from './comments.schemas';
import { CommentsService } from './comments.service';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiZodQuery(listCommentsQuery)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listCommentsQuery)) q: z.infer<typeof listCommentsQuery>) {
    return this.comments.list(user, q.entity_type, q.entity_id, q.limit, q.cursor);
  }

  @Post()
  @RateLimit('comment')
  @ApiZodBody(createCommentSchema)
  create(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Body(new ZodPipe(createCommentSchema)) body: z.infer<typeof createCommentSchema>) {
    return this.comments.create(user, body, clientId);
  }

  @Patch(':id')
  @RateLimit('comment')
  @ApiZodBody(updateCommentSchema)
  update(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateCommentSchema)) body: z.infer<typeof updateCommentSchema>,
  ) {
    return this.comments.update(user, id, body, clientId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Param('id', UuidPipe) id: string) {
    await this.comments.remove(user, id, clientId);
  }
}
