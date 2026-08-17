import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { NotificationTriggersService } from './notification-triggers.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.SEND_EMAIL,
      // Own producer for this queue — the email module's SendEmailProcessor consumes it
      // via BullMQ's global processor auto-discovery (@nestjs/bullmq scans every provider
      // app-wide for @Processor-decorated classes), so no separate registration is needed
      // there. defaultJobOptions apply here since this is the client `.add()` is called on.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        // Some job payloads (welcome emails) carry a plaintext temporary password — don't
        // leave a delivered job's data sitting in Redis once it's no longer needed. Failed
        // jobs are left in place (default) since their delivery/debugging value outweighs
        // the residual exposure for the rare case that needs manual investigation.
        removeOnComplete: true,
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationTriggersService],
  exports: [NotificationsService, NotificationTriggersService],
})
export class NotificationsModule {}
