import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CommissionsService } from '../../commissions/commissions.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.COMMISSION_DIGEST)
export class CommissionDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(CommissionDigestProcessor.name);

  constructor(private readonly commissionsService: CommissionsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.commissionsService.sendDailyDigests();
    this.logger.log('Commission digest run complete');
  }
}
