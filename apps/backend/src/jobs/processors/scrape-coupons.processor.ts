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
  revealSelector?: string;
}

// Bounds how many reveal buttons a single scrape run will click, so a page with an unexpectedly
// large offer list can't turn one scheduled job into an unbounded run.
const MAX_REVEALS_PER_RUN = 25;
const REVEAL_CLICK_DELAY_MS = 300;

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
      // that isn't specified. Skip cleanly rather than guess which merchant a code belongs to.
      this.logger.warn(`Skipping scrape source ${source.id}: no merchantId set`);
      return;
    }

    const config = source.selectorConfig as unknown as SelectorConfig;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      // "Get code" buttons on sites needing revealSelector often open the merchant site (or an
      // affiliate redirect) in a new tab on click. That tab isn't wanted — the code should reveal
      // itself in the original page — so close anything that pops up rather than let it sit open
      // or steal focus.
      page.context().on('page', (popup) => {
        popup.close().catch(() => {});
      });
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      if (config.revealSelector) {
        const revealButtons = await page.$$(config.revealSelector);
        for (const button of revealButtons.slice(0, MAX_REVEALS_PER_RUN)) {
          try {
            await button.click({ timeout: 5_000 });
            await page.waitForTimeout(REVEAL_CLICK_DELAY_MS);
          } catch (error) {
            this.logger.warn(
              `Reveal click failed for source ${source.id}: ${error instanceof Error ? error.message : error}`,
            );
          }
        }
      }

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
