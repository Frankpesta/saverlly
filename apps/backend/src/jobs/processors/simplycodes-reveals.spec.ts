import { Browser, BrowserContext, chromium } from 'playwright';
import { Job } from 'bullmq';
import {
  collectSimplyCodesReveals,
  codeFromRevealUrl,
} from './simplycodes-reveals';
import { launchDetachedChromium } from './scrape-browser';
import { ScrapeCouponsProcessor } from './scrape-coupons.processor';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('./scrape-browser', () => ({ launchDetachedChromium: jest.fn() }));

const sourceUrl = 'https://simplycodes.com/store/allbirds.com';
const config = {
  revealSelector: '.btn-show-code',
  codeSelector: '#sc-modal-code',
};
let mode = 'url';
let listingLoads = 0;

async function fixture(context: BrowserContext) {
  // Entirely offline: every request, including affiliate destinations, is fulfilled here.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    let html = '<html><body>Affiliate destination</body></html>';
    if (url.hostname === 'simplycodes.com') {
      if (url.searchParams.has('sc_modal')) {
        if (mode === 'strip' && url.searchParams.has('sc_code')) {
          await route.fulfill({
            status: 302,
            headers: { location: `${sourceUrl}?sc_modal=1` },
          });
          return;
        }
        const code = url.searchParams.get('sc_code') || 'Fallback_10';
        html =
          mode === 'dom'
            ? `<div id="sc-modal-code"></div><script>setTimeout(() => document.querySelector('#sc-modal-code').textContent = '${code}', 150)</script>`
            : '<p>The modal never renders.</p>';
      } else {
        listingLoads++;
        const ids = listingLoads % 2 ? ['a', 'b'] : ['b', 'a'];
        html = ids
          .map((id) => {
            const code = id === 'a' ? 'SAVE10' : 'SAVE20';
            let target = `${sourceUrl}?sc_modal=1${mode === 'dom' ? '' : `&sc_code=${code}`}`;
            if (mode === 'invalid')
              target = `https://simplycodes.com/store/other.com?sc_modal=1&sc_code=${code}`;
            let action =
              mode === 'missing' || (mode === 'partial' && id === 'b')
                ? ''
                : `const p = window.open('about:blank'); setTimeout(() => { p.location.href = '${target}'; location.href='https://affiliate.test/'; }, 150);`;
            if (mode === 'same-tab') action = `location.href='${target}';`;
            return `<button id="${id}" class="btn-show-code" onclick="${action}">Show Code</button>`;
          })
          .join('');
      }
    }
    await route.fulfill({ contentType: 'text/html', body: html });
  });
}

describe('SimplyCodes reveal extraction (real browser, offline fixtures)', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  afterAll(async () => {
    await browser?.close();
  });
  beforeEach(() => {
    mode = 'url';
    listingLoads = 0;
  });

  it('decodes once, preserves case, and rejects other origins, merchants and invalid codes', () => {
    expect(
      codeFromRevealUrl(
        `${sourceUrl}?sc_modal=1&sc_code=Welcome%5F10`,
        sourceUrl,
      ),
    ).toBe('Welcome_10');
    for (const url of [
      `${sourceUrl}?sc_modal=1&sc_code=SAVE%2520NOW`,
      `${sourceUrl}?sc_modal=1&sc_code=Show+Code`,
      `${sourceUrl}?sc_code=SAVE10`,
      'https://evil.test/store/allbirds.com?sc_modal=1&sc_code=SAVE10',
      'https://simplycodes.com/store/other.com?sc_modal=1&sc_code=SAVE10',
    ])
      expect(codeFromRevealUrl(url, sourceUrl)).toBeNull();
  });

  it.each(['url', 'strip', 'same-tab', 'dom', 'missing', 'invalid', 'partial'])(
    'handles %s reveals without leaking tabs',
    async (scenario) => {
      mode = scenario;
      const context = await browser.newContext();
      try {
        await fixture(context);
        const page = await context.newPage();
        await page.goto(sourceUrl);
        const result = await collectSimplyCodesReveals(
          page,
          sourceUrl,
          config,
          () => {},
          1_500,
        );
        if (['url', 'strip', 'same-tab'].includes(scenario))
          expect(result).toEqual({ codes: ['SAVE10', 'SAVE20'], failures: [] });
        if (scenario === 'dom')
          expect(result).toEqual({ codes: ['Fallback_10'], failures: [] });
        if (scenario === 'missing' || scenario === 'invalid') {
          expect(result.codes).toEqual([]);
          expect(result.failures).toHaveLength(2);
        }
        if (scenario === 'partial') {
          expect(result.codes).toEqual(['SAVE10']);
          expect(result.failures).toHaveLength(1);
        }
        expect(context.pages()).toEqual([page]);
        expect(page.url()).toBe(sourceUrl);
      } finally {
        await context.close();
      }
    },
    20_000,
  );

  it('runs the actual processor and deduplicates persisted codes across retries', async () => {
    const createContext = browser.newContext.bind(browser);
    const spy = jest
      .spyOn(browser, 'newContext')
      .mockImplementation(async (options) => {
        const context = await createContext(options);
        await fixture(context);
        return context;
      });
    const saved = new Set<string>();
    const prisma = {
      scrapeSource: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source',
          active: true,
          merchantId: 'merchant',
          url: sourceUrl,
          selectorConfig: config,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      coupon: {
        upsert: jest.fn().mockImplementation(async (args) => {
          saved.add(args.create.code);
        }),
      },
    };
    jest.mocked(launchDetachedChromium).mockResolvedValue({
      browser,
      cleanup: async () => {
        await Promise.all(browser.contexts().map((context) => context.close()));
      },
    });
    try {
      const processor = new ScrapeCouponsProcessor(
        prisma as unknown as PrismaService,
      );
      const job = {
        id: 'job',
        data: { scrapeSourceId: 'source' },
        attemptsMade: 0,
      } as Job;
      await processor.process(job);
      await processor.process(job);
      expect([...saved].sort()).toEqual(['SAVE10', 'SAVE20']);
      expect(prisma.coupon.upsert).toHaveBeenCalledTimes(4);
      expect(prisma.scrapeSource.update).toHaveBeenCalledTimes(2);
      mode = 'partial';
      await expect(processor.process(job)).rejects.toThrow(
        'SimplyCodes scrape incomplete: saved 1',
      );
      expect(prisma.coupon.upsert).toHaveBeenCalledTimes(5);
      expect(browser.contexts()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  }, 60_000);
});
