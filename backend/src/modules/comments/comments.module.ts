import { Global, Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Global()
@Module({ controllers: [CommentsController], providers: [CommentsService], exports: [CommentsService] })
export class CommentsModule {}
