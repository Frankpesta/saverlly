import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../jobs/queue-names';

const SYNC_JOB_NAME = 'sync-commissions';
const SYNC_JOB_ID = 'sync-commissions-daily';
const DAILY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CommissionsSyncSchedulerService implements OnModuleInit {
  constructor(@InjectQueue(QUEUE_NAMES.SYNC_COMMISSIONS) private readonly syncQueue: Queue) {}

  /**
   * upsertJobScheduler (not queue.add + repeat) so a changed interval actually takes
   * effect on the next boot — BullMQ's legacy repeatable-job dedup keys off a hash of
   * the repeat options themselves, so re-adding with different options can leave the
   * old schedule running alongside the new one instead of replacing it.
   */
  async onModuleInit() {
    await this.syncQueue.upsertJobScheduler(SYNC_JOB_ID, { every: DAILY_MS }, { name: SYNC_JOB_NAME });
  }
}
