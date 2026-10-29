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

// A confirmed checkout also reports that the recipe works (RECIPE_HEALTH); these count only
// the confirmations themselves.
const confirmations = () =>
  sendMessage.mock.calls.filter(([message]) => message.type === "CHECKOUT_CONFIRMED");

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
    expect(confirmations()).toHaveLength(1);
  });
  it("does nothing when no injected context is present on the page", () => {
    setPath("/checkouts/abc");
    renderCheckoutElements();

    loadContentScript();

    expect(confirmations()).toHaveLength(0);
  });

  it("does nothing when the current URL does not match any checkout pattern", () => {
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/cart");
    renderCheckoutElements();

    loadContentScript();

    expect(confirmations()).toHaveLength(0);
  });

  it("confirms immediately when both checkout elements are already present at injection time", () => {
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/checkouts/abc");
    renderCheckoutElements();

    loadContentScript();

    expect(confirmations()).toHaveLength(1);
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
    expect(confirmations()).toHaveLength(0);

    renderCheckoutElements();
    await Promise.resolve();
    await Promise.resolve();

    expect(confirmations()).toHaveLength(1);

    // The observer must disconnect after confirming, a further mutation must not re-fire it.
    document.body.innerHTML += "<span>irrelevant later mutation</span>";
    await Promise.resolve();
    await Promise.resolve();

    expect(confirmations()).toHaveLength(1);
  });

  it("gives up after the detection timeout if the checkout elements never appear", () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = { merchantId: "merchant-1", recipe: RECIPE };
    setPath("/checkouts/abc");

    loadContentScript();
    jest.advanceTimersByTime(10_000);

    expect(confirmations()).toHaveLength(0);
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

    expect(confirmations()).toHaveLength(1);
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

    expect(confirmations()).toHaveLength(0);
  });
});

describe("keeping stores working", () => {
  const health = () =>
    sendMessage.mock.calls.map(([message]) => message).filter((message) => message.type === "RECIPE_HEALTH");
  beforeAll(() => {
    // jsdom lays nothing out; treat anything not inside [hidden] as visible.
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get(this: HTMLElement) {
        return this.closest("[hidden]") ? null : document.body;
      },
    });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent;
  });
  beforeEach(() => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = { merchantId: "m1", recipe: RECIPE };
    setPath("/checkouts/abc");
  });

  it("reports a working recipe once the checkout is confirmed", () => {
    renderCheckoutElements();
    loadContentScript();
    expect(health()).toEqual([{ type: "RECIPE_HEALTH", merchantId: "m1", ok: true }]);
  });

  it("finds an obvious promo box when the saved one is gone, reports it, and lets shoppers use it", async () => {
    document.body.innerHTML = `
      <form><label for="discount-code">Discount code</label><input id="discount-code" name="discount">
      <button type="submit">Apply</button></form>
      <input type="email" name="email" placeholder="Email for discount offers">
      <div id="cart-total">$84.20</div>`;
    loadContentScript();
    expect(confirmations()).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(8_000);
    expect(health()).toEqual([{ type: "RECIPE_HEALTH", merchantId: "m1", ok: false, problem: "PROMO_BOX_CHANGED" }]);
    expect(confirmations()).toHaveLength(1);
    const { backup } = confirmations()[0][0];
    // Used on this very page only, so any selector that finds the right element will do.
    expect(document.querySelector(backup.couponFieldSelector)).toBe(document.getElementById("discount-code"));
    expect(document.querySelector(backup.applyButtonSelector)).toBe(document.querySelector("form button"));
  });

  it("reports a changed promo box but doesn't run coupons when the order total is gone too", async () => {
    document.body.innerHTML = `<input name="coupon_code" placeholder="Coupon code"><button>Apply coupon</button>`;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(health()).toEqual([expect.objectContaining({ ok: false, problem: "PROMO_BOX_CHANGED" })]);
    expect(confirmations()).toHaveLength(0);
  });

  it("reports a changed order total when the saved promo box is still there", async () => {
    document.body.innerHTML = '<input name="reductions" />';
    loadContentScript();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(health()).toEqual([expect.objectContaining({ ok: false, problem: "ORDER_TOTAL_CHANGED" })]);
  });

  it("says nothing on a checkout step without any promo box", async () => {
    document.body.innerHTML = `<input name="address1" placeholder="Street address"><input type="email" name="email"><div id="cart-total">$84.20</div>`;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(health()).toEqual([]);
    expect(confirmations()).toHaveLength(0);
  });

  it("doesn't guess between two possible promo boxes", async () => {
    document.body.innerHTML = `
      <input name="promo" placeholder="Promo code"><input name="giftcard" placeholder="Gift card"><button>Apply</button>
      <div id="cart-total">$84.20</div>`;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(health()).toEqual([]);
    expect(confirmations()).toHaveLength(0);
  });

  it("judges only the recipe's own checkout pages", async () => {
    window.__SAVERLLY__ = { merchantId: "m1", recipe: { ...RECIPE, couponFieldRevealSelector: "#reveal" } };
    setPath("/cart");
    document.body.innerHTML = '<input name="reductions" /><input name="promo" placeholder="Promo code">';
    loadContentScript();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(health()).toEqual([]);
  });
});
