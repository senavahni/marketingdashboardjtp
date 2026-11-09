import { Module } from '@nestjs/common';
import { IntelBrowserController } from './intel-browser.controller';
import { IntelBrowserService } from './intel-browser.service';
import { IntelController } from './intel.controller';
import { IntelLlmKeysController } from './intel-llm-keys.controller';
import { IntelLlmKeysService } from './intel-llm-keys.service';
import { IntelMcpClient } from './intel-mcp-client.service';
import { IntelEventService } from './intel-event.service';
import { IntelMaintenanceService } from './intel-maintenance.service';
import { IntelService } from './intel.service';
import { MissionController } from './mission.controller';
import { MissionExecutorService } from './mission-executor.service';
import { MissionService } from './mission.service';
import { Event13Service } from './v13/event13.service';
import { Jobs13Service } from './v13/jobs13.service';

@Module({
  controllers: [IntelController, MissionController, IntelBrowserController, IntelLlmKeysController],
  providers: [IntelMcpClient, IntelService, IntelEventService, IntelMaintenanceService, MissionService, MissionExecutorService, IntelBrowserService, IntelLlmKeysService, Jobs13Service, Event13Service],
  exports: [IntelService, IntelEventService, IntelMcpClient, Jobs13Service, Event13Service],
})
export class IntelModule {}
