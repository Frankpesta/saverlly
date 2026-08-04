import { Module } from '@nestjs/common';
import { AffiliateProgramsController } from './affiliate-programs.controller';
import { AffiliateProgramsService } from './affiliate-programs.service';

@Module({
  controllers: [AffiliateProgramsController],
  providers: [AffiliateProgramsService],
  exports: [AffiliateProgramsService],
})
export class AffiliateProgramsModule {}
