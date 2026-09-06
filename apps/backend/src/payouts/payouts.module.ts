import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GeneratePayoutsProcessor } from '../jobs/processors/generate-payouts.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { NotificationsModule } from '../notifications/notifications.module';
import { StripeModule } from '../stripe/stripe.module';
import { MyPayoutsController } from './my-payouts.controller';
import { PayoutGenerationSchedulerService } from './payout-generation-scheduler.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { StripeWebhooksController } from './stripe-webhooks.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.GENERATE_PAYOUTS,
      // Without this, a transient failure (RDS blip) gets one attempt and then silently
      // waits for next month's scheduled run -- see the send-email queue in
      // notifications.module.ts for the same pattern. Safe to retry: generatePayouts()
      // always re-reads unswept events fresh, so a retry never double-processes.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    }),
    StripeModule,
    NotificationsModule,
  ],
  controllers: [
    StripeWebhooksController,
    PayoutsController,
    MyPayoutsController,
  ],
  providers: [
    PayoutsService,
    GeneratePayoutsProcessor,
    PayoutGenerationSchedulerService,
  ],
  exports: [PayoutsService],
})
export class PayoutsModule {}
