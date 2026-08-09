import { AttributionMethod, type PublicMerchant } from '@saverlly/shared-types';

const chromeMock = {
  tabs: {
    update: jest.fn().mockResolvedValue(undefined),
  },
};
(globalThis as unknown as { chrome: typeof chrome }).chrome = chromeMock as unknown as typeof chrome;

jest.mock('./api-client');
jest.mock('./storage');

import { mintAttributionSubId } from './api-client';
import { runAttribution } from './attribution';
import { appendAttributionLog } from './storage';

const mockMintAttributionSubId = mintAttributionSubId as jest.MockedFunction<typeof mintAttributionSubId>;
const mockAppendAttributionLog = appendAttributionLog as jest.MockedFunction<typeof appendAttributionLog>;
const mockFetch = jest.fn();

const baseMerchant: PublicMerchant = {
  id: 'merchant-1',
  name: 'Test Merchant',
  domain: 'shop.example.com',
  attributionMethod: AttributionMethod.URL_PARAM,
  affiliateTrackingUrl: null,
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  affiliateSubIdParamKey: null,
  active: true,
  checkoutRecipe: null,
  coupons: [],
};

describe('runAttribution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAppendAttributionLog.mockResolvedValue(undefined);
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    mockFetch.mockResolvedValue(new Response(null));
  });

  it('appends the platform tracking param and redirects when URL_PARAM is not yet present', async () => {
    const merchant: PublicMerchant = {
      ...baseMerchant,
      affiliateUrlParamKey: 'irclickid',
      affiliateUrlParamValue: 'platform-id',
    };

    const result = await runAttribution(1, 'https://shop.example.com/cart', merchant);

    expect(result).toBe('https://shop.example.com/cart?irclickid=platform-id');
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(1, { url: result });
  });

  it('does not mint a sub-ID when the merchant has no affiliateSubIdParamKey', async () => {
    const merchant: PublicMerchant = {
      ...baseMerchant,
      affiliateUrlParamKey: 'irclickid',
      affiliateUrlParamValue: 'platform-id',
    };

    await runAttribution(1, 'https://shop.example.com/cart', merchant);

    expect(mockMintAttributionSubId).not.toHaveBeenCalled();
  });

  it('mints a sub-ID and appends it to the redirect URL for URL_PARAM merchants that support one', async () => {
    mockMintAttributionSubId.mockResolvedValue('device1abc123');
    const merchant: PublicMerchant = {
      ...baseMerchant,
      affiliateUrlParamKey: 'irclickid',
      affiliateUrlParamValue: 'platform-id',
      affiliateSubIdParamKey: 'SubId1',
    };

    const result = await runAttribution(1, 'https://shop.example.com/cart', merchant);

    expect(mockMintAttributionSubId).toHaveBeenCalledWith('merchant-1');
    expect(result).toContain('irclickid=platform-id');
    expect(result).toContain('SubId1=device1abc123');
  });

  it('appends the sub-ID to the cookie tracking URL for COOKIE merchants', async () => {
    mockMintAttributionSubId.mockResolvedValue('device1abc123');
    const merchant: PublicMerchant = {
      ...baseMerchant,
      attributionMethod: AttributionMethod.COOKIE,
      affiliateTrackingUrl: 'https://track.network.com/pixel',
      affiliateSubIdParamKey: 'SubId1',
    };

    await runAttribution(1, 'https://shop.example.com/cart', merchant);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://track.network.com/pixel?SubId1=device1abc123',
      expect.any(Object),
    );
  });

  it('still fires cookie tracking when minting the sub-ID fails', async () => {
    mockMintAttributionSubId.mockRejectedValue(new Error('network down'));
    const merchant: PublicMerchant = {
      ...baseMerchant,
      attributionMethod: AttributionMethod.COOKIE,
      affiliateTrackingUrl: 'https://track.network.com/pixel',
      affiliateSubIdParamKey: 'SubId1',
    };

    const result = await runAttribution(1, 'https://shop.example.com/cart', merchant);

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('https://track.network.com/pixel', expect.any(Object));
  });

  it('logs the attribution attempt regardless of redirect outcome', async () => {
    const merchant: PublicMerchant = { ...baseMerchant };

    await runAttribution(1, 'https://shop.example.com/cart', merchant);

    expect(mockAppendAttributionLog).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: 'merchant-1', domain: 'shop.example.com' }),
    );
  });
});
