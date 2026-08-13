import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
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
import { CommissionsModule } from './commissions/commissions.module';
import { PayoutsModule } from './payouts/payouts.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    // Serves uploaded files (e.g. announcement images) back out at /uploads/... — the backend
    // isn't containerized (see docker-compose.yml, only postgres/redis are), so a local
    // ./uploads directory persists fine across restarts in dev without a volume mount.
    ServeStaticModule.forRoot({
      rootPath: path.join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
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
    CommissionsModule,
    PayoutsModule,
    SearchModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
