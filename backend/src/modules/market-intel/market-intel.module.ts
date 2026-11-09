import { Module } from '@nestjs/common';
import { IntelModule } from '../intel/intel.module';
import { ApprovalsService } from './approvals.service';
import { CatalogController } from './catalog.controller';
import { ContentService } from './content.service';
import { ExportsService } from './exports.service';
import { IntelDataController } from './intel-data.controller';
import { IntelProxyService } from './intel-proxy.service';
import { OpportunitiesService } from './opportunities.service';
import { ProductsService } from './products.service';
import { UploadsService } from './uploads.service';

/** v1.0.0 Marketing Intelligence (DSH-V1-02). Job & event kontrak 1.3 ada di IntelModule (v13/). */
@Module({
  imports: [IntelModule],
  controllers: [CatalogController, IntelDataController],
  providers: [ProductsService, OpportunitiesService, ContentService, ApprovalsService, IntelProxyService, UploadsService, ExportsService],
})
export class MarketIntelModule {}
