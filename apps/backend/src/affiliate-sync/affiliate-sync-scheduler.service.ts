import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../jobs/queue-names';

const SYNC_JOB_NAME = 'sync-affiliate-feed';
const SYNC_JOB_ID = 'sync-affiliate-feed-daily';
const DAILY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AffiliateSyncSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.SYNC_AFFILIATE_FEED) private readonly syncQueue: Queue,
  ) {}

  /** Idempotent. BullMQ dedupes repeat registration by jobId, safe to call on every boot. */
  async onModuleInit() {
    await this.syncQueue.add(SYNC_JOB_NAME, {}, { jobId: SYNC_JOB_ID, repeat: { every: DAILY_MS } });
  }
}
