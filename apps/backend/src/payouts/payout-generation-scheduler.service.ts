import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
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

  /** Idempotent — BullMQ dedupes repeat registration by jobId, safe to call on every boot. */
  async onModuleInit() {
    const intervalDays = Number(
      this.configService.get('PAYOUT_AGGREGATION_INTERVAL_DAYS') ?? DEFAULT_INTERVAL_DAYS,
    );
    await this.payoutsQueue.add(
      GENERATE_JOB_NAME,
      {},
      { jobId: GENERATE_JOB_ID, repeat: { every: intervalDays * 24 * 60 * 60 * 1000 } },
    );
  }
}
