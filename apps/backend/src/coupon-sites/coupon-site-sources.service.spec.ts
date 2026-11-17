import {
  disabledCouponSites,
  enabledCouponSites,
} from './coupon-site-sources.service';

describe('COUPON_SITES_DISABLED', () => {
  it('reads a comma-separated list, any case, ignoring unknown names', () => {
    const env = { COUPON_SITES_DISABLED: ' couponfollow, NOPE ,GENERIC_CSS' };
    expect(disabledCouponSites(env)).toEqual(['COUPONFOLLOW']);
    expect(enabledCouponSites(env).map((site) => site.strategy)).toEqual([
      'SIMPLYCODES',
    ]);
  });

  it('enables every site when unset', () => {
    expect(disabledCouponSites({})).toEqual([]);
    expect(enabledCouponSites({}).map((site) => site.strategy)).toEqual([
      'SIMPLYCODES',
      'COUPONFOLLOW',
    ]);
  });
});
