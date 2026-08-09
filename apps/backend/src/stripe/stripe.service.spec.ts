import { ConfigService } from '@nestjs/config';
import { StripeService, toStripeCents } from './stripe.service';

describe('toStripeCents', () => {
  it('converts a dollar amount to integer cents', () => {
    expect(toStripeCents(1.5)).toBe(150);
    expect(toStripeCents(49.99)).toBe(4999);
    expect(toStripeCents(0)).toBe(0);
  });

  it('rounds rather than truncates on a fractional-cent edge case', () => {
    expect(toStripeCents(19.995)).toBe(2000);
  });
});

describe('StripeService', () => {
  it('constructs without throwing even with no STRIPE_SECRET_KEY configured', () => {
    const configService = { get: () => undefined, getOrThrow: () => 'unused' } as unknown as ConfigService;
    expect(() => new StripeService(configService)).not.toThrow();
  });
});
