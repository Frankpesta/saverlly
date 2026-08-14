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
    BullModule.registerQueue({ name: QUEUE_NAMES.GENERATE_PAYOUTS }),
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
