import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PayoutsService } from '../../payouts/payouts.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.GENERATE_PAYOUTS)
export class GeneratePayoutsProcessor extends WorkerHost {
  private readonly logger = new Logger(GeneratePayoutsProcessor.name);

  constructor(private readonly payoutsService: PayoutsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.payoutsService.generatePayouts();
    this.logger.log(`Payout aggregation: ${result.payoutsCreated} payout(s) created`);
  }
}
