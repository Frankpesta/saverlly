import { matchesCheckoutUrl } from './checkout-match';

describe('matchesCheckoutUrl', () => {
  const patterns = ['/checkout', '/cart/checkout'];

  it('matches when the pathname contains a configured pattern', () => {
    expect(matchesCheckoutUrl('https://shop.example.com/checkout/payment', patterns)).toBe(true);
    expect(matchesCheckoutUrl('https://shop.example.com/cart/checkout', patterns)).toBe(true);
  });

  it('does not match unrelated pages', () => {
    expect(matchesCheckoutUrl('https://shop.example.com/product/123', patterns)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesCheckoutUrl('https://shop.example.com/Checkout', patterns)).toBe(true);
  });

  it('returns false when no patterns are configured', () => {
    expect(matchesCheckoutUrl('https://shop.example.com/checkout', [])).toBe(false);
  });

  it('falls back to raw string matching for a malformed URL rather than throwing', () => {
    expect(matchesCheckoutUrl('/checkout/payment', patterns)).toBe(true);
  });
});
