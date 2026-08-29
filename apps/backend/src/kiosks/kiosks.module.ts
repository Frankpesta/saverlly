import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KiosksController } from './kiosks.controller';
import { KiosksService } from './kiosks.service';
import { MyKioskController } from './my-kiosk.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [KiosksController, MyKioskController],
  providers: [KiosksService],
  exports: [KiosksService],
})
export class KiosksModule {}
