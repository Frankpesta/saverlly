import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { EmailService } from './email.service';
import { renderEmail } from './render';
import { EmailJob } from './types/email-job.type';

@Processor(QUEUE_NAMES.SEND_EMAIL)
export class SendEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendEmailProcessor.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<void> {
    const backendUrl = this.configService.get<string>(
      'PUBLIC_BACKEND_URL',
      'http://localhost:3000',
    );
    const dashboardUrl = this.configService.get<string>(
      'DASHBOARD_BASE_URL',
      'http://localhost:3001',
    );

    const { subject, react } = renderEmail(job.data, {
      logoUrl: `${backendUrl}/brand/logo-light-bg-sm.png`,
      loginUrl: `${dashboardUrl}/portal/login`,
      earningsUrl: `${dashboardUrl}/portal/earnings`,
    });

    await this.emailService.send(job.data.to, subject, react, job.id);
    this.logger.log(`Sent email job=${job.id} type=${job.data.type}`);
  }
}
