import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CouponSource } from '@prisma/client';
import { Job } from 'bullmq';
import { chromium } from 'playwright';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue-names';

interface ScrapeCouponsJobData {
  scrapeSourceId: string;
}

interface SelectorConfig {
  codeSelector: string;
  descriptionSelector?: string;
}

@Processor(QUEUE_NAMES.SCRAPE_COUPONS)
export class ScrapeCouponsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapeCouponsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ScrapeCouponsJobData>): Promise<void> {
    const source = await this.prisma.scrapeSource.findUnique({
      where: { id: job.data.scrapeSourceId },
    });
    if (!source || !source.active) {
      return;
    }

    if (!source.merchantId) {
      // Multi-merchant scrape pages need a per-extracted-item merchant resolution strategy
      // that isn't specified — skip cleanly rather than guess which merchant a code belongs to.
      this.logger.warn(`Skipping scrape source ${source.id}: no merchantId set`);
      return;
    }

    const config = source.selectorConfig as unknown as SelectorConfig;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const codes = await page.$$eval(config.codeSelector, (elements) =>
        elements
          .map((el) => el.textContent?.trim())
          .filter((text): text is string => !!text),
      );

      for (const code of codes) {
        await this.prisma.coupon.upsert({
          where: { merchantId_code: { merchantId: source.merchantId, code } },
          update: { source: CouponSource.SCRAPE, active: true },
          create: { merchantId: source.merchantId, code, source: CouponSource.SCRAPE },
        });
      }

      this.logger.log(`Scraped ${codes.length} code(s) from source ${source.id}`);
    } finally {
      await browser.close();
      await this.prisma.scrapeSource.update({
        where: { id: source.id },
        data: { lastRunAt: new Date() },
      });
    }
  }
}
