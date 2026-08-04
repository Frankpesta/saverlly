import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScrapeSourceDto } from './dto/create-scrape-source.dto';
import { UpdateScrapeSourceDto } from './dto/update-scrape-source.dto';

const SCRAPE_JOB_NAME = 'scrape-coupons';

@Injectable()
export class ScrapeSourcesService implements OnModuleInit {
  private readonly logger = new Logger(ScrapeSourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCRAPE_COUPONS) private readonly scrapeQueue: Queue,
  ) {}

  /** Resyncs repeatable jobs on boot — self-healing if Redis's job schedule was ever lost/reset. */
  async onModuleInit() {
    try {
      const activeSources = await this.prisma.scrapeSource.findMany({ where: { active: true } });
      await Promise.all(activeSources.map((s) => this.scheduleRepeat(s.id, s.intervalMinutes)));
    } catch (err) {
      this.logger.error('Failed to resync scrape-source repeat jobs on boot — continuing without scheduling', err);
    }
  }

  async create(dto: CreateScrapeSourceDto) {
    if (dto.merchantId) {
      await this.assertMerchantExists(dto.merchantId);
    }

    const source = await this.prisma.scrapeSource.create({
      data: {
        url: dto.url,
        merchantId: dto.merchantId,
        selectorConfig: dto.selectorConfig as unknown as Prisma.InputJsonValue,
        intervalMinutes: dto.intervalMinutes ?? 1440,
      },
    });
    await this.scheduleRepeat(source.id, source.intervalMinutes);
    return source;
  }

  findAll() {
    return this.prisma.scrapeSource.findMany({ orderBy: { id: 'desc' } });
  }

  async findOneOrThrow(id: string) {
    const source = await this.prisma.scrapeSource.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException('Scrape source not found');
    }
    return source;
  }

  async update(id: string, dto: UpdateScrapeSourceDto) {
    const existing = await this.findOneOrThrow(id);
    if (dto.merchantId) {
      await this.assertMerchantExists(dto.merchantId);
    }

    const updated = await this.prisma.scrapeSource.update({
      where: { id },
      data: {
        url: dto.url,
        merchantId: dto.merchantId,
        selectorConfig: dto.selectorConfig
          ? (dto.selectorConfig as unknown as Prisma.InputJsonValue)
          : undefined,
        intervalMinutes: dto.intervalMinutes,
        active: dto.active,
      },
    });

    // Reschedule unconditionally — cheap, and avoids subtly missing an interval/active-state change.
    await this.unscheduleRepeat(id, existing.intervalMinutes);
    if (updated.active) {
      await this.scheduleRepeat(id, updated.intervalMinutes);
    }

    return updated;
  }

  async runNow(id: string) {
    await this.findOneOrThrow(id);
    await this.scrapeQueue.add(SCRAPE_JOB_NAME, { scrapeSourceId: id });
    return { queued: true };
  }

  private async scheduleRepeat(id: string, intervalMinutes: number) {
    await this.scrapeQueue.add(
      SCRAPE_JOB_NAME,
      { scrapeSourceId: id },
      { jobId: this.repeatJobId(id), repeat: { every: intervalMinutes * 60_000 } },
    );
  }

  private async unscheduleRepeat(id: string, intervalMinutes: number) {
    await this.scrapeQueue.removeRepeatable(
      SCRAPE_JOB_NAME,
      { every: intervalMinutes * 60_000 },
      this.repeatJobId(id),
    );
  }

  private repeatJobId(id: string): string {
    return `scrape-source-${id}`;
  }

  private async assertMerchantExists(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
  }
}
