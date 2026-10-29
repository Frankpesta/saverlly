import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  detectStorePlatform,
  type PlatformDetection,
} from '@saverlly/shared-types';
import {
  fetchPublicPage,
  PageFetchError,
} from '../common/http/fetch-public-page';
import { PrismaService } from '../prisma/prisma.service';

export type PlatformCheck =
  | { reachable: true; detection: PlatformDetection | null }
  | { reachable: false; reason: string };

/**
 * Works out which shopping platform a store runs on by reading its homepage, so store setup can
 * start from that platform's template. Best effort: a site that can't be reached or blocks the
 * request just stays unrecognised and is set up by clicking.
 */
@Injectable()
export class PlatformDetectionService {
  private readonly logger = new Logger(PlatformDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Reads the store's homepage over HTTPS, falling back to HTTP. */
  async check(domain: string): Promise<PlatformCheck> {
    let reason = 'The site could not be reached';
    for (const scheme of ['https', 'http']) {
      try {
        const page = await fetchPublicPage(`${scheme}://${domain}/`);
        return {
          reachable: true,
          detection: detectStorePlatform(page.body, page.headers),
        };
      } catch (error) {
        if (!(error instanceof PageFetchError)) throw error;
        reason = error.message;
      }
    }
    return { reachable: false, reason };
  }

  /** Checks the store and records what was found. A store that can't be reached keeps its
   * previous answer. */
  async detectAndSave(merchantId: string, domain: string) {
    const result = await this.check(domain);
    if (!result.reachable) return { result, merchant: null };
    const merchant = await this.prisma.merchant.update({
      // Pinned to the domain checked, so a domain changed meanwhile isn't given its answer.
      where: { id: merchantId, domain },
      data: {
        platform: result.detection?.platform ?? null,
        platformCheckedAt: new Date(),
      },
    });
    return { result, merchant };
  }

  /** detectAndSave in the background, for a store just added or given a new domain. Off in
   * tests, which must never reach out to real websites; they call detectAndSave directly. */
  detectInBackground(merchantId: string, domain: string): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.detectAndSave(merchantId, domain).catch((error: unknown) => {
      // Gone or renamed meanwhile: nothing to record.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        return;
      this.logger.warn(
        `Platform check for ${domain} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}
