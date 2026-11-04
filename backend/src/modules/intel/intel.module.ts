import { Module } from '@nestjs/common';
import { IntelController } from './intel.controller';
import { IntelMcpClient } from './intel-mcp-client.service';
import { IntelEventService } from './intel-event.service';
import { IntelMaintenanceService } from './intel-maintenance.service';
import { IntelService } from './intel.service';

@Module({
  controllers: [IntelController],
  providers: [IntelMcpClient, IntelService, IntelEventService, IntelMaintenanceService],
  exports: [IntelService, IntelEventService],
})
export class IntelModule {}
