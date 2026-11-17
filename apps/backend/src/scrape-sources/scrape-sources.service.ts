import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScrapeSourceStatus, ScrapeStrategy } from '@prisma/client';
import {
  couponSiteInfo,
  couponSiteStoreUrl,
  CouponSiteStrategy,
} from '@saverlly/shared-types';
import {
  CouponSiteSourcesService,
  disabledCouponSites,
} from '../coupon-sites/coupon-site-sources.service';
import { ScrapeDispatcherService } from '../coupon-sites/scrape-dispatcher.service';
import { ScrapeHealthService } from '../coupon-sites/scrape-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScrapeSourceDto } from './dto/create-scrape-source.dto';
import { UpdateScrapeSourceDto } from './dto/update-scrape-source.dto';

type SelectorShape = {
  rowSelector?: string;
  merchantSelector?: string;
} | null;

@Injectable()
export class ScrapeSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: ScrapeDispatcherService,
    private readonly couponSites: CouponSiteSourcesService,
    private readonly health: ScrapeHealthService,
  ) {}

  /** The coupon sites panel: each site's last 24 hours of runs. */
  siteHealth() {
    return this.health.siteHealth();
  }

  /** Gives every active merchant its sources on the built-in coupon sites. */
  backfill() {
    return this.couponSites.backfill();
  }

  async create(dto: CreateScrapeSourceDto) {
    const strategy = dto.strategy ?? ScrapeStrategy.GENERIC_CSS;
    const site = couponSiteInfo(strategy);
    let url = dto.url;
    if (site) {
      // A coupon site's source is always one store's page there.
      if (disabledCouponSites().includes(strategy))
        throw new BadRequestException(
          `${site.label} is switched off (COUPON_SITES_DISABLED)`,
        );
      if (!dto.merchantId)
        throw new BadRequestException(
          `Choose the merchant whose ${site.label} page to read`,
        );
      if (dto.selectorConfig && strategy !== ScrapeStrategy.SIMPLYCODES)
        throw new BadRequestException(
          `${site.label} sources don't take selectors`,
        );
      if (dto.selectorConfig?.rowSelector)
        throw new BadRequestException(
          'A coupon site source reads one store, not a multi-merchant feed',
        );
      const merchant = await this.findMerchantOrThrow(dto.merchantId);
      url ??= couponSiteStoreUrl(
        strategy as CouponSiteStrategy,
        merchant.domain,
      );
    } else {
      if (!dto.selectorConfig)
        throw new BadRequestException(
          'Add the CSS selectors this page is read with',
        );
      if (!url) throw new BadRequestException('Page URL is required');
      this.validateSelectors(dto.merchantId, dto.selectorConfig);
      if (dto.merchantId) await this.findMerchantOrThrow(dto.merchantId);
    }

    try {
      return await this.prisma.scrapeSource.create({
        data: {
          strategy,
          url: url,
          merchantId: dto.merchantId,
          selectorConfig: dto.selectorConfig
            ? (dto.selectorConfig as unknown as Prisma.InputJsonValue)
            : undefined,
          intervalMinutes:
            dto.intervalMinutes ?? site?.defaultIntervalMinutes ?? 1440,
          // First run on the dispatcher's next tick.
          nextRunAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          `This merchant already has a ${site?.label ?? strategy} source`,
        );
      throw error;
    }
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
    const isSite = existing.strategy !== ScrapeStrategy.GENERIC_CSS;
    if (isSite) {
      if (dto.merchantId === null || dto.selectorConfig?.rowSelector)
        throw new BadRequestException(
          'A coupon site source reads one store, not a multi-merchant feed',
        );
      if (
        dto.selectorConfig &&
        existing.strategy !== ScrapeStrategy.SIMPLYCODES
      )
        throw new BadRequestException(
          "This coupon site doesn't take selectors",
        );
    } else {
      this.validateSelectors(
        dto.merchantId === undefined ? existing.merchantId : dto.merchantId,
        dto.selectorConfig ?? (existing.selectorConfig as SelectorShape),
      );
    }
    if (dto.merchantId) {
      await this.findMerchantOrThrow(dto.merchantId);
    }

    const now = Date.now();
    const reactivated = dto.active === true && !existing.active;
    const intervalChanged =
      dto.intervalMinutes !== undefined &&
      dto.intervalMinutes !== existing.intervalMinutes;
    try {
      return await this.prisma.scrapeSource.update({
        where: { id },
        data: {
          url: dto.url,
          merchantId: dto.merchantId,
          selectorConfig: dto.selectorConfig
            ? (dto.selectorConfig as unknown as Prisma.InputJsonValue)
            : undefined,
          intervalMinutes: dto.intervalMinutes,
          active: dto.active,
          // Switched back on: run on the next tick, and forget what the site said last time.
          // A new interval takes effect from now rather than after the old one runs out.
          ...(reactivated
            ? { nextRunAt: new Date(now), status: ScrapeSourceStatus.ACTIVE }
            : intervalChanged
              ? { nextRunAt: new Date(now + dto.intervalMinutes! * 60_000) }
              : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'That merchant already has a source on this coupon site',
        );
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.scrapeSource.delete({ where: { id } });
  }

  async runNow(id: string) {
    const source = await this.findOneOrThrow(id);
    if (!source.active)
      throw new BadRequestException('Activate this source before running it');
    await this.dispatcher.runNow(source);
    return { queued: true };
  }

  private validateSelectors(
    merchantId: string | null | undefined,
    config: SelectorShape,
  ) {
    if (
      !config ||
      (config.rowSelector
        ? !!merchantId || !config.merchantSelector
        : !merchantId || !!config.merchantSelector)
    ) {
      throw new BadRequestException(
        'Choose a merchant, or configure both rowSelector and merchantSelector without a fixed merchant',
      );
    }
  }

  private async findMerchantOrThrow(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, domain: true },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }
}
