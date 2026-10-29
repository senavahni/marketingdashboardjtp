import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { ClientId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { batchBlocksSchema, createBlockSchema, reorderBlocksSchema, updateBlockSchema } from './blocks.schemas';
import { BlocksService } from './blocks.service';

@ApiTags('Blocks')
@ApiBearerAuth()
@Controller()
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get('tasks/:id/blocks')
  taskBlocks(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.blocks.taskBlocks(user, id);
  }

  @Get('projects/:id/brief/blocks')
  briefBlocks(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.blocks.briefBlocks(user, id);
  }

  @Post('blocks/batch')
  @HttpCode(200)
  @RateLimit('blockWrite')
  @ApiZodBody(batchBlocksSchema)
  batch(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Body(new ZodPipe(batchBlocksSchema)) body: z.infer<typeof batchBlocksSchema>) {
    return this.blocks.batch(user, body, clientId);
  }

  @Patch('blocks/reorder')
  @RateLimit('blockWrite')
  @ApiZodBody(reorderBlocksSchema)
  reorder(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Body(new ZodPipe(reorderBlocksSchema)) body: z.infer<typeof reorderBlocksSchema>) {
    return this.blocks.reorder(user, body, clientId);
  }

  @Post('blocks')
  @RateLimit('blockWrite')
  @ApiZodBody(createBlockSchema)
  create(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Body(new ZodPipe(createBlockSchema)) body: z.infer<typeof createBlockSchema>) {
    return this.blocks.create(user, body, clientId);
  }

  @Patch('blocks/:id')
  @RateLimit('blockWrite')
  @ApiZodBody(updateBlockSchema)
  update(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateBlockSchema)) body: z.infer<typeof updateBlockSchema>,
  ) {
    return this.blocks.update(user, id, body, clientId);
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  @RateLimit('blockWrite')
  async remove(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Param('id', UuidPipe) id: string) {
    await this.blocks.remove(user, id, clientId);
  }

  @Post('blocks/:id/run')
  @RateLimit('blockWrite')
  run(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.blocks.runPrompt(user, id);
  }
}
