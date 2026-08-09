import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { StripeService, toStripeCents } from './stripe.service';

describe('toStripeCents', () => {
  it('converts a Decimal dollar amount to integer cents', () => {
    expect(toStripeCents(new Prisma.Decimal(1.5))).toBe(150);
    expect(toStripeCents(new Prisma.Decimal('49.99'))).toBe(4999);
    expect(toStripeCents(new Prisma.Decimal(0))).toBe(0);
  });

  it('rounds rather than truncates on a fractional-cent edge case, via exact Decimal arithmetic', () => {
    expect(toStripeCents(new Prisma.Decimal('19.995'))).toBe(2000);
  });
});

describe('StripeService', () => {
  it('constructs without throwing even with no STRIPE_SECRET_KEY configured', () => {
    const configService = { get: () => undefined, getOrThrow: () => 'unused' } as unknown as ConfigService;
    expect(() => new StripeService(configService)).not.toThrow();
  });
});
