import { Module } from '@nestjs/common';
import { KioskUsersController } from './kiosk-users.controller';
import { KioskUsersService } from './kiosk-users.service';

@Module({
  controllers: [KioskUsersController],
  providers: [KioskUsersService],
})
export class KioskUsersModule {}
