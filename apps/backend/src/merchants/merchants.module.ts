import { Module } from '@nestjs/common';
import { ScrapeSourcesModule } from '../scrape-sources/scrape-sources.module';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { PlatformDetectionService } from './platform-detection.service';

@Module({
  imports: [ScrapeSourcesModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, PlatformDetectionService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
