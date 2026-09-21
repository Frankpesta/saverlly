import { CommissionsSyncSchedulerService } from '../../src/commissions/commissions-sync-scheduler.service';
import { CommissionDigestSchedulerService } from '../../src/commissions/commission-digest-scheduler.service';
import { PayoutGenerationSchedulerService } from '../../src/payouts/payout-generation-scheduler.service';
import { AffiliateSyncSchedulerService } from '../../src/affiliate-sync/affiliate-sync-scheduler.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

export async function createTestApp(): Promise<INestApplication> {
  // Scheduled jobs are exercised explicitly; background schedules must not race fixture resets.
  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const scheduler of [
    CommissionsSyncSchedulerService,
    CommissionDigestSchedulerService,
    PayoutGenerationSchedulerService,
    AffiliateSyncSchedulerService,
  ]) {
    builder
      .overrideProvider(scheduler)
      .useValue({ onModuleInit: async () => {} });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Mirrors main.ts's bootstrap() exactly, so e2e tests exercise the same error-handling
  // path production traffic does instead of Nest's untouched default filter.
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}
