import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KioskUsersController } from './kiosk-users.controller';
import { KioskUsersService } from './kiosk-users.service';

@Module({
  imports: [NotificationsModule],
  controllers: [KioskUsersController],
  providers: [KioskUsersService],
})
export class KioskUsersModule {}
