import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutRecipeDto } from './checkout-recipe.dto';

const required = {
  couponFieldSelector: 'input',
  applyButtonSelector: 'button',
  cartTotalSelector: '.total',
  checkoutUrlPatterns: ['/checkout'],
};

describe('checkout recipe comparison configuration', () => {
  it.each([undefined, null, '', '   '])(
    'rejects remove mode with selector %p',
    async (removeCouponSelector) => {
      const errors = await validate(
        plainToInstance(CheckoutRecipeDto, {
          ...required,
          couponApplyMode: 'remove',
          removeCouponSelector,
        }),
      );
      expect(
        errors.some((error) => error.property === 'removeCouponSelector'),
      ).toBe(true);
    },
  );
  it.each([undefined, '', 'button.remove'])(
    'allows optional removal for replace mode: %p',
    async (removeCouponSelector) => {
      expect(
        await validate(
          plainToInstance(CheckoutRecipeDto, {
            ...required,
            couponApplyMode: 'replace',
            removeCouponSelector,
          }),
        ),
      ).toEqual([]);
    },
  );
  it('normalizes a configured remove selector and accepts the complete recipe', async () => {
    const recipe = plainToInstance(CheckoutRecipeDto, {
      ...required,
      couponApplyMode: 'remove',
      removeCouponSelector:
        '  button[data-event-name=\\"remove_discount_code\\"]  ',
    });
    expect(recipe.removeCouponSelector).toBe(
      'button[data-event-name="remove_discount_code"]',
    );
    expect(await validate(recipe)).toEqual([]);
  });
});

it.each([
  {},
  { ...required, couponFieldSelector: '[' },
  { ...required, checkoutUrlPatterns: [] },
  { ...required, cartTotalSelector: '' },
])('rejects unusable checkout recipe %p', async (recipe) => {
  expect(
    (await validate(plainToInstance(CheckoutRecipeDto, recipe))).length,
  ).toBeGreaterThan(0);
});
