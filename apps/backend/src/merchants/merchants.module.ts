import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { PlatformDetectionService } from './platform-detection.service';

@Module({
  controllers: [MerchantsController],
  providers: [MerchantsService, PlatformDetectionService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
