import { Module } from '@nestjs/common';
import { WebReportsController } from './web-reports.controller';
import { WebReportsService } from './web-reports.service';

@Module({ controllers: [WebReportsController], providers: [WebReportsService] })
export class WebReportsModule {}
