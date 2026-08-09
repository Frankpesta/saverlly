import { AttributionMethod, CouponSource } from '@saverlly/shared-types';
import type { PublicMerchant } from '@saverlly/shared-types';

const addListenerMocks = {
  onInstalled: jest.fn(),
  onStartup: jest.fn(),
  onAlarm: jest.fn(),
  tabsOnRemoved: jest.fn(),
  onCommitted: jest.fn(),
  onHistoryStateUpdated: jest.fn(),
  onMessage: jest.fn(),
};

const chromeMock = {
  runtime: {
    onInstalled: { addListener: addListenerMocks.onInstalled },
    onStartup: { addListener: addListenerMocks.onStartup },
    onMessage: { addListener: addListenerMocks.onMessage },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  alarms: {
    create: jest.fn(),
    onAlarm: { addListener: addListenerMocks.onAlarm },
  },
  tabs: {
    onRemoved: { addListener: addListenerMocks.tabsOnRemoved },
    get: jest.fn(),
    query: jest.fn(),
    update: jest.fn(),
  },
  webNavigation: {
    onCommitted: { addListener: addListenerMocks.onCommitted },
    onHistoryStateUpdated: { addListener: addListenerMocks.onHistoryStateUpdated },
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue(undefined),
  },
};

(globalThis as unknown as { chrome: typeof chrome }).chrome = chromeMock as unknown as typeof chrome;

jest.mock('../lib/api-client');
jest.mock('../lib/attribution');
jest.mock('../lib/storage');
jest.mock('../lib/native-messaging');

import { fetchMerchantByDomain } from '../lib/api-client';
import { runAttribution } from '../lib/attribution';
import { getCachedMerchant, isDormant, setCachedMerchant } from '../lib/storage';

// Imported after the chrome/module mocks above are in place — the service worker
// registers its listeners as a side effect of module load.
import './service-worker';

const mockFetchMerchantByDomain = fetchMerchantByDomain as jest.MockedFunction<typeof fetchMerchantByDomain>;
const mockRunAttribution = runAttribution as jest.MockedFunction<typeof runAttribution>;
const mockGetCachedMerchant = getCachedMerchant as jest.MockedFunction<typeof getCachedMerchant>;
const mockSetCachedMerchant = setCachedMerchant as jest.MockedFunction<typeof setCachedMerchant>;
const mockIsDormant = isDormant as jest.MockedFunction<typeof isDormant>;

const merchant: PublicMerchant = {
  id: 'm1',
  name: 'Test Merchant',
  domain: 'shop.example.com',
  attributionMethod: AttributionMethod.URL_PARAM,
  affiliateTrackingUrl: null,
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  affiliateSubIdParamKey: null,
  active: true,
  checkoutRecipe: {
    couponFieldSelector: '#coupon',
    applyButtonSelector: '#apply',
    successIndicatorSelector: '.success',
    failureIndicatorSelector: '.failure',
    cartTotalSelector: '.total',
    checkoutUrlPatterns: ['/checkout'],
  },
  coupons: [
    {
      id: 'c1',
      merchantId: 'm1',
      code: 'SAVE10',
      description: null,
      source: CouponSource.MANUAL,
      discountType: null,
      discountValue: null,
      successCount: 0,
      failCount: 0,
      lastTestedAt: null,
      expiresAt: null,
      active: true,
    },
  ],
};

// Captured immediately after module load — the listeners are registered once, as a
// side effect of importing service-worker.ts, so this must run before any per-test
// jest.clearAllMocks() would wipe that call record.
const registeredOnCommitted = addListenerMocks.onCommitted.mock.calls[0]?.[0];
const registeredOnHistoryStateUpdated = addListenerMocks.onHistoryStateUpdated.mock.calls[0]?.[0];

describe('top-frame navigation handling', () => {
  beforeEach(() => {
    mockIsDormant.mockReset();
    mockGetCachedMerchant.mockReset();
    mockSetCachedMerchant.mockReset();
    mockFetchMerchantByDomain.mockReset();
    mockRunAttribution.mockReset();
    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.setBadgeBackgroundColor.mockClear();
    chromeMock.scripting.executeScript.mockClear();
  });

  it('registers the exact same handler for onCommitted and onHistoryStateUpdated', () => {
    expect(registeredOnCommitted).toBeDefined();
    expect(registeredOnCommitted).toBe(registeredOnHistoryStateUpdated);
  });

  it('injects the checkout-detector on a cart-to-checkout History API route change with no document reload', async () => {
    mockIsDormant.mockResolvedValue(false);
    mockGetCachedMerchant.mockResolvedValue(null);
    mockSetCachedMerchant.mockResolvedValue(undefined);
    mockFetchMerchantByDomain.mockResolvedValue(merchant);
    mockRunAttribution.mockResolvedValue(null);

    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 0,
      url: 'https://shop.example.com/checkout',
    });

    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(chromeMock.scripting.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: { tabId: 7 }, files: ['content-scripts/checkout-detector.js'] }),
    );
  });

  it('clears stale tab state and the badge immediately, even when the extension is dormant', async () => {
    mockIsDormant.mockResolvedValue(true);

    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 0,
      url: 'https://shop.example.com/checkout',
    });

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '' });
    expect(mockFetchMerchantByDomain).not.toHaveBeenCalled();
  });

  it('ignores sub-frame navigation events', async () => {
    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 1,
      url: 'https://ads.example.com/iframe',
    });

    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
    expect(mockIsDormant).not.toHaveBeenCalled();
  });
});
