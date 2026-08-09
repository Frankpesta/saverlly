import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { parsePositiveIntEnv } from '../common/config/positive-int-env.util';
import { QUEUE_NAMES } from '../jobs/queue-names';

const GENERATE_JOB_NAME = 'generate-payouts';
const GENERATE_JOB_ID = 'generate-payouts-scheduled';
const DEFAULT_INTERVAL_DAYS = 30;

@Injectable()
export class PayoutGenerationSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.GENERATE_PAYOUTS) private readonly payoutsQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  /**
   * upsertJobScheduler (not queue.add + repeat) so a changed interval actually takes
   * effect on the next boot — BullMQ's legacy repeatable-job dedup keys off a hash of
   * the repeat options themselves, so re-adding with different options can leave the
   * old schedule running alongside the new one instead of replacing it.
   */
  async onModuleInit() {
    const intervalDays = parsePositiveIntEnv(
      this.configService.get('PAYOUT_AGGREGATION_INTERVAL_DAYS'),
      DEFAULT_INTERVAL_DAYS,
    );
    await this.payoutsQueue.upsertJobScheduler(
      GENERATE_JOB_ID,
      { every: intervalDays * 24 * 60 * 60 * 1000 },
      { name: GENERATE_JOB_NAME },
    );
  }
}
