/**
 * @jest-environment jsdom
 */
import { CouponSource, type CheckoutRecipe, type PublicCoupon } from '@saverlly/shared-types';

declare function require(id: string): unknown;

const sendMessage = jest.fn();
(globalThis as unknown as { chrome: typeof chrome }).chrome = { runtime: { sendMessage } } as unknown as typeof chrome;

const RECIPE: CheckoutRecipe = {
  couponFieldSelector: 'input[data-test="promo-code-input"]',
  applyButtonSelector: 'button[data-test="apply-promo-code-button"]',
  successIndicatorSelector: '.success',
  failureIndicatorSelector: '.failure',
  cartTotalSelector: '#cart-total',
  checkoutUrlPatterns: ['/checkout'],
};

const COUPON: PublicCoupon = {
  id: 'coupon-1',
  merchantId: 'merchant-1',
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
};

function loadContentScript(): void {
  jest.resetModules();
  require('./coupon-applier');
}

beforeEach(() => {
  sendMessage.mockClear();
  document.body.innerHTML = '';
  window.__SAVERLLY__ = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('coupon-applier content script — click-to-reveal coupon fields', () => {
  // Regression test for a live Target checkout bug: the promo code input and apply button
  // aren't in the DOM at all until a "+ Add promo code" trigger is clicked. Without the
  // reveal step, document.querySelector(recipe.couponFieldSelector) is permanently null.
  it('clicks the reveal trigger and finds the field it renders before typing into it', async () => {
    jest.useFakeTimers();
    const recipe = { ...RECIPE, couponFieldRevealSelector: '#add-promo-code-btn' };
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe, coupons: [COUPON] };
    document.body.innerHTML = '<div id="cart-total">$40.05</div><button id="add-promo-code-btn"></button>';
    document.querySelector('#add-promo-code-btn')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<input data-test="promo-code-input" /><button data-test="apply-promo-code-button"></button>',
      );
    });

    loadContentScript();
    await jest.advanceTimersByTimeAsync(4_000); // let waitForIndicator's poll loop exhaust and resolve

    const field = document.querySelector<HTMLInputElement>('input[data-test="promo-code-input"]');
    expect(field?.value).toBe('SAVE10');
  });

  it('reports no_coupons_available if the reveal trigger never renders the coupon field', async () => {
    jest.useFakeTimers();
    const recipe = { ...RECIPE, couponFieldRevealSelector: '#add-promo-code-btn' };
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe, coupons: [COUPON] };
    // Trigger exists but (unlike the test above) does nothing on click — the field never appears.
    document.body.innerHTML = '<div id="cart-total">$40.05</div><button id="add-promo-code-btn"></button>';

    loadContentScript();
    await jest.advanceTimersByTimeAsync(3_100); // past the 3s reveal timeout

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COUPON_APPLY_RESULT', result: 'no_coupons_available' }),
    );
  });

  it('does not attempt a reveal click when couponFieldRevealSelector is unset (unchanged behavior)', async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE, coupons: [COUPON] };
    // No coupon field anywhere, and no reveal trigger configured.
    document.body.innerHTML = '<div id="cart-total">$40.05</div>';

    loadContentScript();
    await jest.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COUPON_APPLY_RESULT', result: 'no_coupons_available' }),
    );
  });
});
