import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CommissionsService } from '../../commissions/commissions.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.SYNC_COMMISSIONS)
export class SyncCommissionsProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncCommissionsProcessor.name);

  constructor(private readonly commissionsService: CommissionsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.commissionsService.syncNow();
    this.logger.log(
      `Commission sync: ingested ${result.ingested}, confirmed ${result.confirmed}, reversed ${result.reversed}`,
    );
  }
}
