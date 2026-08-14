import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KiosksController } from './kiosks.controller';
import { KiosksService } from './kiosks.service';

@Module({
  imports: [NotificationsModule],
  controllers: [KiosksController],
  providers: [KiosksService],
  exports: [KiosksService],
})
export class KiosksModule {}
