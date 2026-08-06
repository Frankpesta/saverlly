import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KiosksModule } from './kiosks/kiosks.module';
import { KioskUsersModule } from './kiosk-users/kiosk-users.module';
import { LocationsModule } from './locations/locations.module';
import { DevicesModule } from './devices/devices.module';
import { BullmqConfigModule } from './jobs/bullmq-config.module';
import { AffiliateProgramsModule } from './affiliate-programs/affiliate-programs.module';
import { MerchantsModule } from './merchants/merchants.module';
import { CouponsModule } from './coupons/coupons.module';
import { ScrapeSourcesModule } from './scrape-sources/scrape-sources.module';
import { AffiliateSyncModule } from './affiliate-sync/affiliate-sync.module';
import { PublicApiModule } from './public-api/public-api.module';
import { AnnouncementsModule } from './announcements/announcements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    PrismaModule,
    BullmqConfigModule,
    AuthModule,
    UsersModule,
    KiosksModule,
    KioskUsersModule,
    LocationsModule,
    DevicesModule,
    AffiliateProgramsModule,
    MerchantsModule,
    CouponsModule,
    ScrapeSourcesModule,
    AffiliateSyncModule,
    PublicApiModule,
    AnnouncementsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
