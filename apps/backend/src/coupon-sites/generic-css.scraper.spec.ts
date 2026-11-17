import { launchDetachedChromium } from '../jobs/processors/scrape-browser';
import { PrismaService } from '../prisma/prisma.service';
import { CouponSiteRegistry } from './coupon-site-registry';
import { ScrapeRunnerService } from './scrape-runner.service';

jest.mock('../jobs/processors/scrape-browser', () => ({
  launchDetachedChromium: jest.fn(),
}));

describe('generic scrape error reporting', () => {
  function fixture(
    codes: string[],
    extractionFails = false,
    revealFails = false,
  ) {
    const page = {
      title: async () => 'Coupons',
      evaluate: async () => '',
      goto: async () => ({ status: () => 200 }),
      waitForTimeout: async () => {},
      waitForSelector: async () => null,
      $$: async () =>
        revealFails
          ? [
              {
                click: async () => {
                  throw new Error('Button detached');
                },
              },
            ]
          : [],
      $$eval: async (selector: string) => {
        if (selector === 'iframe') return false;
        if (extractionFails) throw new Error('Execution context destroyed');
        return codes;
      },
    };
    const prisma = {
      scrapeSource: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source',
          strategy: 'GENERIC_CSS',
          active: true,
          merchantId: 'merchant',
          intervalMinutes: 1440,
          url: 'https://coupons.test/store',
          selectorConfig: {
            codeSelector: '.code',
            ...(revealFails ? { revealSelector: '.reveal' } : {}),
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      coupon: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      couponSighting: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (work) => work(prisma)),
    };
    const cleanup = jest.fn().mockResolvedValue(undefined);
    jest.mocked(launchDetachedChromium).mockResolvedValue({
      browser: {
        version: () => 'test',
        newContext: async () => ({
          addInitScript: async () => {},
          newPage: async () => page,
          on: () => {},
        }),
      } as never,
      cleanup,
    });
    return {
      prisma,
      cleanup,
      run: () =>
        new ScrapeRunnerService(
          prisma as unknown as PrismaService,
          new CouponSiteRegistry(),
          jest.fn(),
        ).run('source', { id: 'job', attemptsMade: 0 }),
    };
  }
  it('fails and records extraction errors instead of reporting a successful empty scrape', async () => {
    const { run, prisma, cleanup } = fixture([], true);
    await expect(run()).rejects.toThrow('Main page extraction failed');
    expect(prisma.scrapeSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining('extraction failed'),
          lastCodeCount: 0,
        }),
      }),
    );
    expect(cleanup).toHaveBeenCalled();
  });
  it('retains partial codes but requests a retry when reveals failed', async () => {
    const { run, prisma } = fixture(['SAVE10'], false, true);
    await expect(run()).rejects.toThrow('Reveal click failed');
    expect(prisma.coupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'SAVE10' }),
      }),
    );
    expect(prisma.scrapeSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastCodeCount: 1,
          lastError: expect.any(String),
        }),
      }),
    );
  });
  it('persists a separate success timestamp only after successful extraction', async () => {
    const { run, prisma } = fixture(['SAVE10']);
    await run();
    expect(prisma.scrapeSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastSucceededAt: expect.any(Date),
          lastError: null,
          lastCodeCount: 1,
        }),
      }),
    );
  });
});
