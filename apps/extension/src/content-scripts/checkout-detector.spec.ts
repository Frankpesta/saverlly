/**
 * @jest-environment jsdom
 */
import type { CheckoutRecipe } from '@saverlly/shared-types';

// ts-jest compiles this file to CommonJS regardless of the extension's browser-only tsconfig
// (which has no Node types), so `require` is genuinely available at runtime here. Just not
// typed. Declared locally rather than pulling @types/node into the whole extension build.
declare function require(id: string): unknown;

const sendMessage = jest.fn();
(globalThis as unknown as { chrome: typeof chrome }).chrome = { runtime: { sendMessage } } as unknown as typeof chrome;

const RECIPE: CheckoutRecipe = {
  couponFieldSelector: 'input[name="reductions"]',
  applyButtonSelector: 'button.apply',
  successIndicatorSelector: '.success',
  failureIndicatorSelector: '.failure',
  cartTotalSelector: '#cart-total',
  checkoutUrlPatterns: ['/checkouts/'],
};

function setPath(pathname: string): void {
  window.history.pushState({}, '', pathname);
}

function renderCheckoutElements(): void {
  document.body.innerHTML = '<input name="reductions" /><div id="cart-total"></div>';
}

// checkout-detector.ts is a self-executing content script. Re-importing it after
// jest.resetModules() re-runs its top-level IIFE against whatever DOM/window state the
// test has set up beforehand.
function loadContentScript(): void {
  jest.resetModules();
  require('./checkout-detector');
}

beforeEach(() => {
  sendMessage.mockClear();
  document.body.innerHTML = '';
  window.__SAVERLLY__ = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('checkout-detector content script', () => {
  it('does nothing when no injected context is present on the page', () => {
    setPath('/checkouts/abc');
    renderCheckoutElements();

    loadContentScript();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the current URL does not match any checkout pattern', () => {
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE };
    setPath('/cart');
    renderCheckoutElements();

    loadContentScript();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('confirms immediately when both checkout elements are already present at injection time', () => {
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE };
    setPath('/checkouts/abc');
    renderCheckoutElements();

    loadContentScript();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'CHECKOUT_CONFIRMED',
      merchantId: 'merchant-1',
      referrer: document.referrer,
    });
  });

  // The real bug this regression-tests: a client-rendered checkout SPA (confirmed against a
  // live Allbirds checkout) mounts the coupon field/cart total *after* this script runs, since
  // it's injected on webNavigation.onCommitted. Well before hydration completes. A single
  // synchronous check misses this; the detector must keep watching until the elements appear.
  it('waits for the checkout elements to render asynchronously, then confirms exactly once', async () => {
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE };
    setPath('/checkouts/abc');

    loadContentScript();
    expect(sendMessage).not.toHaveBeenCalled();

    renderCheckoutElements();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);

    // The observer must disconnect after confirming, a further mutation must not re-fire it.
    document.body.innerHTML += '<span>irrelevant later mutation</span>';
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('gives up after the detection timeout if the checkout elements never appear', () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = { merchantId: 'merchant-1', recipe: RECIPE };
    setPath('/checkouts/abc');

    loadContentScript();
    jest.advanceTimersByTime(10_000);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
