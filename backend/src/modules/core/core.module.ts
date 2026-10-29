import { Global, Module } from '@nestjs/common';
import { TaskReaderService } from '../tasks/task-reader.service';
import { AccessService } from './access.service';
import { ActorService } from './actor.service';

@Global()
@Module({
  providers: [AccessService, ActorService, TaskReaderService],
  exports: [AccessService, ActorService, TaskReaderService],
})
export class CoreModule {}
