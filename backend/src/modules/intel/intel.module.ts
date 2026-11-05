import { Module } from '@nestjs/common';
import { IntelBrowserController } from './intel-browser.controller';
import { IntelBrowserService } from './intel-browser.service';
import { IntelController } from './intel.controller';
import { IntelMcpClient } from './intel-mcp-client.service';
import { IntelEventService } from './intel-event.service';
import { IntelMaintenanceService } from './intel-maintenance.service';
import { IntelService } from './intel.service';
import { MissionController } from './mission.controller';
import { MissionService } from './mission.service';

@Module({
  controllers: [IntelController, MissionController, IntelBrowserController],
  providers: [IntelMcpClient, IntelService, IntelEventService, IntelMaintenanceService, MissionService, IntelBrowserService],
  exports: [IntelService, IntelEventService],
})
export class IntelModule {}
