import { Module } from '@nestjs/common';
import { SendEmailProcessor } from './email-queue.processor';
import { EmailService } from './email.service';

@Module({
  // No BullModule.registerQueue() here — SendEmailProcessor is discovered globally by
  // @nestjs/bullmq's BullExplorer (a DiscoveryModule scan over every provider app-wide),
  // and resolves the send-email queue's connection options from NotificationsModule's own
  // registration (the actual producer, and where defaultJobOptions/retry policy live).
  providers: [EmailService, SendEmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
