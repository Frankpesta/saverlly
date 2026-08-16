import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../jobs/queue-names';

const DIGEST_JOB_NAME = 'commission-digest';
const DIGEST_JOB_ID = 'commission-digest-daily';
const DAILY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CommissionDigestSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.COMMISSION_DIGEST)
    private readonly digestQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.digestQueue.upsertJobScheduler(
      DIGEST_JOB_ID,
      { every: DAILY_MS },
      { name: DIGEST_JOB_NAME },
    );
  }
}
