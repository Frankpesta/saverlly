/**
 * @jest-environment jsdom
 */
import type { CheckoutRecipe } from "@saverlly/shared-types";

// ts-jest compiles this file to CommonJS regardless of the extension's browser-only tsconfig
// (which has no Node types), so `require` is genuinely available at runtime here. Just not
// typed. Declared locally rather than pulling @types/node into the whole extension build.
declare function require(id: string): unknown;

const sendMessage = jest.fn();
(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  runtime: { sendMessage },
} as unknown as typeof chrome;

const RECIPE: CheckoutRecipe = {
  couponFieldSelector: 'input[name="reductions"]',
  applyButtonSelector: "button.apply",
  successIndicatorSelector: ".success",
  failureIndicatorSelector: ".failure",
  cartTotalSelector: "#cart-total",
  checkoutUrlPatterns: ["/checkouts/"],
};

function setPath(pathname: string): void {
  window.history.pushState({}, "", pathname);
}

function renderCheckoutElements(): void {
  document.body.innerHTML =
    '<input name="reductions" /><div id="cart-total"></div>';
}

// checkout-detector.ts is a self-executing content script. Re-importing it after
// jest.resetModules() re-runs its top-level IIFE against whatever DOM/window state the
// test has set up beforehand.
function loadContentScript(): void {
  jest.resetModules();
  require("./checkout-detector");
}

beforeEach(() => {
  window.__SAVERLLY_DETECTOR__?.();
  sendMessage.mockClear();
  document.body.innerHTML = "";
  window.__SAVERLLY__ = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("checkout-detector content script", () => {
  it("detects a delayed Target reveal control after the former ten-second deadline", async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = {
      merchantId: "target",
      recipe: {
        ...RECIPE,
        checkoutUrlPatterns: ["/checkout"],
        couponFieldRevealSelector: "#reveal",
        cartTotalSelector: '[data-test=\\"cart-summary-total\\"]',
      },
    };
    setPath("/cart");
    loadContentScript();
    await jest.advanceTimersByTimeAsync(12_000);
    document.body.innerHTML =
      '<button id="reveal">Add promo code</button><div data-test="cart-summary-total">$100</div>';
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "target" }),
    );
  });

  it("replaces the old observer on reinjection instead of confirming twice", async () => {
    window.__SAVERLLY__ = { merchantId: "m1", recipe: RECIPE };
    setPath("/checkouts/abc");
    loadContentScript();
    loadContentScript();
    renderCheckoutElements();
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("does nothing when no injected context is present on the page", () => {
    setPath("/checkouts/abc");
    renderCheckoutElements();

    loadContentScript();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does nothing when the current URL does not match any checkout pattern", () => {
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/cart");
    renderCheckoutElements();

    loadContentScript();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("confirms immediately when both checkout elements are already present at injection time", () => {
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/checkouts/abc");
    renderCheckoutElements();

    loadContentScript();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "CHECKOUT_CONFIRMED",
      merchantId: "merchant-1",
      referrer: document.referrer,
    });
  });

  // The real bug this regression-tests: a client-rendered checkout SPA (confirmed against a
  // live Allbirds checkout) mounts the coupon field/cart total *after* this script runs, since
  // it's injected on webNavigation.onCommitted. Well before hydration completes. A single
  // synchronous check misses this; the detector must keep watching until the elements appear.
  it("waits for the checkout elements to render asynchronously, then confirms exactly once", async () => {
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/checkouts/abc");

    loadContentScript();
    expect(sendMessage).not.toHaveBeenCalled();

    renderCheckoutElements();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);

    // The observer must disconnect after confirming, a further mutation must not re-fire it.
    document.body.innerHTML += "<span>irrelevant later mutation</span>";
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("gives up after the detection timeout if the checkout elements never appear", () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/checkouts/abc");

    loadContentScript();
    jest.advanceTimersByTime(10_000);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Regression test for a live Target checkout bug: its coupon field/apply button don't exist
  // in the DOM at all until a "+ Add promo code" button is clicked. Waiting on
  // couponFieldSelector directly (as above) never resolves. couponFieldRevealSelector lets the
  // recipe declare that trigger so detection can confirm without needing to click anything.
  it("confirms when only the reveal trigger is present, not the coupon field itself", () => {
    const recipeWithReveal = {
      ...RECIPE,
      couponFieldRevealSelector: "#add-promo-code-btn",
    };
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: recipeWithReveal,
    };
    setPath("/checkouts/abc");
    document.body.innerHTML =
      '<button id="add-promo-code-btn"></button><div id="cart-total"></div>';

    loadContentScript();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "CHECKOUT_CONFIRMED",
      merchantId: "merchant-1",
      referrer: document.referrer,
    });
  });

  it("does not confirm on reveal-trigger presence alone if the cart total is still missing", () => {
    jest.useFakeTimers();
    const recipeWithReveal = {
      ...RECIPE,
      couponFieldRevealSelector: "#add-promo-code-btn",
    };
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: recipeWithReveal,
    };
    setPath("/checkouts/abc");
    document.body.innerHTML = '<button id="add-promo-code-btn"></button>';

    loadContentScript();
    jest.advanceTimersByTime(10_000); // let the observer give up and disconnect within the test

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
