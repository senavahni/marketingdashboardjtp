import { Global, Module } from '@nestjs/common';
import { TaskAssignmentService } from './task-assignment.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Global()
@Module({ controllers: [TasksController], providers: [TasksService, TaskAssignmentService], exports: [TasksService] })
export class TasksModule {}
