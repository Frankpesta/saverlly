import { detectStorePlatform } from '@saverlly/shared-types';
import {
  fetchPublicPage,
  PageFetchError,
} from '../common/http/fetch-public-page';
import type { PrismaService } from '../prisma/prisma.service';
import { PlatformDetectionService } from './platform-detection.service';

jest.mock('../common/http/fetch-public-page', () => ({
  ...jest.requireActual<typeof import('../common/http/fetch-public-page')>(
    '../common/http/fetch-public-page',
  ),
  fetchPublicPage: jest.fn(),
}));
const mockFetch = jest.mocked(fetchPublicPage);
const ANY_DATE: unknown = expect.any(Date);

describe('detectStorePlatform', () => {
  it.each([
    [
      'SHOPIFY',
      '<link rel="preconnect" href="https://cdn.shopify.com"><script>Shopify.shop = "x.myshopify.com";</script>',
    ],
    [
      'WOOCOMMERCE',
      '<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css">',
    ],
    ['WOOCOMMERCE', '<meta name="generator" content="WooCommerce 9.3.1">'],
    ['WOOCOMMERCE', '<body class="home woocommerce-page theme-x">'],
    [
      'BIGCOMMERCE',
      '<script src="https://cdn11.bigcommerce.com/s-abc/stencil/theme.js"></script>',
    ],
    [
      'MAGENTO',
      '<div data-mage-init=\'{"collapsible":{}}\'></div><script src="/static/version1/frontend/Magento_Theme/x.js"></script>',
    ],
    ['WIX', '<img src="https://static.wixstatic.com/media/a.jpg">'],
    ['SQUARESPACE', '<script>Static.SQUARESPACE_CONTEXT = {};</script>'],
  ])('recognises %s', (platform, html) => {
    expect(detectStorePlatform(html)?.platform).toBe(platform);
  });

  it('recognises a platform from its response headers alone', () => {
    expect(detectStorePlatform('<html></html>', { 'X-ShopId': '123' })).toEqual(
      {
        platform: 'SHOPIFY',
        evidence: 'x-shopid header',
      },
    );
    expect(
      detectStorePlatform('<html></html>', { Server: 'Squarespace' })?.platform,
    ).toBe('SQUARESPACE');
  });

  it('leaves a custom or plain WordPress site unrecognised', () => {
    expect(
      detectStorePlatform(
        '<html><head><link href="/wp-content/themes/twentytwenty/style.css"></head><body class="blog">We sell shoes.</body></html>',
        { server: 'nginx' },
      ),
    ).toBeNull();
  });

  it('says what gave the platform away', () => {
    expect(
      detectStorePlatform(
        '<script src="https://cdn.shopify.com/s/x.js"></script>',
      )?.evidence,
    ).toBe('cdn.shopify.com in the page');
  });
});

describe('PlatformDetectionService', () => {
  const update = jest.fn();
  const service = new PlatformDetectionService({
    merchant: { update },
  } as unknown as PrismaService);
  const page = (body: string) => ({ url: '', status: 200, headers: {}, body });

  beforeEach(() => {
    mockFetch.mockReset();
    update
      .mockReset()
      .mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 'm1', ...data }),
      );
  });

  it('falls back to HTTP when HTTPS fails, and records the platform', async () => {
    mockFetch
      .mockRejectedValueOnce(new PageFetchError('certificate expired'))
      .mockResolvedValueOnce(
        page('<script src="https://cdn.shopify.com/x.js"></script>'),
      );
    const { result, merchant } = await service.detectAndSave('m1', 'shop.test');
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://shop.test/',
      'http://shop.test/',
    ]);
    expect(result).toMatchObject({
      reachable: true,
      detection: { platform: 'SHOPIFY' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'm1', domain: 'shop.test' },
      data: { platform: 'SHOPIFY', platformCheckedAt: ANY_DATE },
    });
    expect(merchant).toMatchObject({ platform: 'SHOPIFY' });
  });

  it('records a reachable custom store as unrecognised', async () => {
    mockFetch.mockResolvedValueOnce(page('<html>Our own shop</html>'));
    await service.detectAndSave('m1', 'shop.test');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { platform: null, platformCheckedAt: ANY_DATE },
      }),
    );
  });

  it("keeps the previous answer when the site can't be reached", async () => {
    mockFetch.mockRejectedValue(
      new PageFetchError('The site took too long to answer'),
    );
    const { result } = await service.detectAndSave('m1', 'shop.test');
    expect(result).toEqual({
      reachable: false,
      reason: 'The site took too long to answer',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
