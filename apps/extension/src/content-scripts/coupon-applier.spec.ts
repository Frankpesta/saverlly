/**
 * @jest-environment jsdom
 */
import { CouponSource, type CheckoutRecipe, type PublicCoupon } from '@saverlly/shared-types';

declare function require(id: string): unknown;

const sendMessage = jest.fn();
(globalThis as unknown as { chrome: typeof chrome }).chrome = { runtime: { sendMessage } } as unknown as typeof chrome;

const RECIPE: CheckoutRecipe = {
  couponApplyMode: 'replace',
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
  window.__SAVERLLY_APPLYING__ = false;
});

it('preserves reusable indicator nodes and waits for delayed totals after success', async () => {
  jest.useFakeTimers();
  window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE, coupons: [COUPON] };
  document.body.innerHTML = '<div id="cart-total">$100.00</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button"></button><div class="success" hidden>Applied</div><div class="failure" hidden>Invalid</div>';
  const success = document.querySelector<HTMLElement>('.success')!;
  const failure = document.querySelector<HTMLElement>('.failure')!;
  Object.defineProperty(success, 'offsetParent', { get: () => success.hidden ? null : document.body });
  document.querySelector('button')!.addEventListener('click', () => {
    success.hidden = false;
    setTimeout(() => { document.querySelector('#cart-total')!.textContent = '$90.00'; }, 750);
  });
  loadContentScript();
  await jest.advanceTimersByTimeAsync(2000);
  expect(document.querySelector('.success')).toBe(success);
  expect(document.querySelector('.failure')).toBe(failure);
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ result: 'applied', discountAmount: 10 }));
});

it('uses the native input setter so controlled inputs receive the changed value', async () => {
  jest.useFakeTimers();
  window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE, coupons: [COUPON] };
  document.body.innerHTML = '<div id="cart-total">$100.00</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button"></button>';
  const field = document.querySelector('input')!;
  const instanceSetter = jest.fn();
  Object.defineProperty(field, 'value', { set: instanceSetter, configurable: true });
  const input = jest.fn(); field.addEventListener('input', input);
  loadContentScript(); await jest.advanceTimersByTimeAsync(4500);
  expect(instanceSetter).not.toHaveBeenCalled();
  expect(input).toHaveBeenCalledTimes(1);
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

describe('coupon-applier content script — stale indicator from a prior failed attempt', () => {
  // Regression test for a live Allbirds checkout bug: the site's own error banner for a failed
  // code (e.g. "Enter a valid discount code") is never removed or hidden once a later, different
  // code succeeds -- confirmed live, not just assumed. Without clearing it before each new
  // attempt, waitForIndicator's very first poll tick for the next coupon sees that leftover
  // failure element (already visible from the previous attempt) and reports the new attempt as
  // failed before its own real outcome -- which takes a moment to render -- has any chance to.
  it('does not let a previous failure banner preempt the next coupon actually succeeding', async () => {
    jest.useFakeTimers();
    const badCoupon: PublicCoupon = { ...COUPON, id: 'coupon-bad', code: 'BAD' };
    const workingCoupon: PublicCoupon = { ...COUPON, id: 'coupon-works', code: 'WORKS10' };
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE, coupons: [badCoupon, workingCoupon] };
    document.body.innerHTML =
      '<div id="cart-total">$40.05</div>' +
      '<input data-test="promo-code-input" />' +
      '<button data-test="apply-promo-code-button"></button>';

    // jsdom has no layout engine -- offsetParent is always null regardless of real DOM
    // presence, so isVisible()'s real check needs a stand-in here to exercise it at all.
    function markVisible(selector: string): void {
      Object.defineProperty(document.querySelector(selector)!, 'offsetParent', {
        value: document.body,
        configurable: true,
      });
    }

    document.querySelector('[data-test="apply-promo-code-button"]')!.addEventListener('click', () => {
      const code = document.querySelector<HTMLInputElement>('input[data-test="promo-code-input"]')!.value;
      if (code === 'BAD') {
        // The site's own error banner -- left in the DOM indefinitely, exactly like the real
        // Allbirds checkout leaves "Enter a valid discount code or gift card" on screen.
        document.body.insertAdjacentHTML('beforeend', '<div class="failure">Enter a valid code</div>');
        markVisible('.failure');
        return;
      }
      // A real checkout takes a moment to confirm a valid code -- this delay is the window
      // during which a stale, still-visible failure element from the previous attempt would
      // otherwise win the race.
      setTimeout(() => {
        document.querySelector('#cart-total')!.textContent = '$36.05';
        document.body.insertAdjacentHTML('beforeend', '<div class="success">Applied!</div>');
        markVisible('.success');
      }, 500);
    });

    loadContentScript();
    await jest.advanceTimersByTimeAsync(4_500);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COUPON_APPLY_RESULT', code: 'BAD', result: 'failed' }),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'COUPON_APPLY_RESULT',
        code: 'WORKS10',
        result: 'applied',
        isFinal: true,
      }),
    );
  });
});

describe('largest confirmed saving', () => {
  function checkout(discounts: Record<string, number>, mode: 'replace' | 'remove' = 'replace') {
    jest.useFakeTimers();
    const clicks: string[] = [];
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: { ...RECIPE, couponApplyMode: mode, ...(mode === 'remove' ? { removeCouponSelector: '#remove' } : {}) }, coupons: Object.keys(discounts).map((code, i) => ({ ...COUPON, code, id: `c${i}` })) };
    document.body.innerHTML = '<div id="cart-total">$100.00</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button"></button><div class="success" hidden></div><div class="failure" hidden></div><button id="remove" hidden>Remove</button>';
    const success = document.querySelector<HTMLElement>('.success')!;
    const failure = document.querySelector<HTMLElement>('.failure')!;
    const remove = document.querySelector<HTMLElement>('#remove')!;
    for (const el of [success, failure, remove]) Object.defineProperty(el, 'offsetParent', { get: () => el.hidden ? null : document.body });
    document.querySelector('[data-test="apply-promo-code-button"]')!.addEventListener('click', () => {
      const code = document.querySelector('input')!.value;
      clicks.push(code); success.hidden = true; failure.hidden = true;
      if (discounts[code] > 0) {
        document.querySelector('#cart-total')!.textContent = `$${100 - discounts[code]}`;
        success.hidden = false; remove.hidden = false;
      } else failure.hidden = false;
    });
    remove.addEventListener('click', () => {
      clicks.push('REMOVE'); remove.hidden = true; success.hidden = true;
      setTimeout(() => { document.querySelector('#cart-total')!.textContent = '$100.00'; }, 250);
    });
    return { clicks, discounts, remove };
  }

  it('tests past the first success, reapplies an earlier winner, and emits one final savings result', async () => {
    const { clicks } = checkout({ FIRST10: 10, BEST30: 30, BAD: 0, LAST20: 20 });
    loadContentScript(); await jest.advanceTimersByTimeAsync(15000);
    expect(clicks).toEqual(['FIRST10', 'BEST30', 'BAD', 'LAST20', 'BEST30']);
    const final = sendMessage.mock.calls.map(([message]) => message).filter(message => message.isFinal);
    expect(final).toEqual([expect.objectContaining({ code: 'BEST30', result: 'applied', discountAmount: 30, originalTotal: 100, newTotal: 70, testedCount: 4 })]);
  });

  it('restores the baseline between non-stacking tests in remove mode', async () => {
    const { clicks } = checkout({ BEST30: 30, LAST10: 10 }, 'remove');
    loadContentScript(); await jest.advanceTimersByTimeAsync(15000);
    expect(clicks).toEqual(['BEST30', 'REMOVE', 'LAST10', 'REMOVE', 'BEST30']);
    expect(document.querySelector('#cart-total')!.textContent).toBe('$70');
  });

  it('keeps the first winner on equal monetary savings', async () => {
    const { clicks } = checkout({ FIRST20: 20, SECOND20: 20 });
    loadContentScript(); await jest.advanceTimersByTimeAsync(15000);
    expect(clicks).toEqual(['FIRST20', 'SECOND20', 'FIRST20']);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true, code: 'FIRST20', discountAmount: 20 }));
  });

  it('does not claim success when the winner fails during reapplication', async () => {
    const { discounts } = checkout({ BEST30: 30, LAST10: 10 }, 'remove');
    document.querySelector('[data-test="apply-promo-code-button"]')!.addEventListener('click', () => {
      if (document.querySelector('input')!.value === 'LAST10') discounts.BEST30 = 0;
    });
    loadContentScript(); await jest.advanceTimersByTimeAsync(15000);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true, result: 'failed', failureReason: 'restore_failed' }));
    expect(sendMessage.mock.calls.some(([m]) => m.isFinal && m.result === 'applied')).toBe(false);
  });

  it('leaves the cart untouched when multi-code comparison is not configured', async () => {
    const { clicks } = checkout({ FIRST10: 10, LAST20: 20 });
    delete window.__SAVERLLY__!.recipe.couponApplyMode;
    loadContentScript(); await jest.advanceTimersByTimeAsync(1000);
    expect(clicks).toEqual([]);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ failureReason: 'comparison_unavailable', testedCount: 0 }));
  });

  it('restores the shopper’s original code if none of the tested codes improve it', async () => {
    const { clicks } = checkout({ EXISTING30: 30, LAST10: 10 });
    document.querySelector('input')!.value = 'EXISTING30';
    document.querySelector('#cart-total')!.textContent = '$70';
    document.querySelector<HTMLElement>('.success')!.hidden = false;
    loadContentScript(); await jest.advanceTimersByTimeAsync(20000);
    expect(clicks).toEqual(['EXISTING30', 'LAST10', 'EXISTING30']);
    expect(document.querySelector('#cart-total')!.textContent).toBe('$70');
    expect(sendMessage.mock.calls.some(([m]) => m.isFinal && m.result === 'applied')).toBe(false);
  });
});
