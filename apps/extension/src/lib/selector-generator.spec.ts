/**
 * @jest-environment jsdom
 */
import { normalizeCheckoutSelector } from "@saverlly/shared-types";
// The backend validates every submitted selector with this; a generated one must never fail it.
import { isCssSelector } from "../../../backend/src/common/validators/is-css-selector.decorator";
import { element } from "./checkout-dom";
import { generateSelector, looksGenerated, type SelectorResult } from "./selector-generator";

// jsdom has no layout: an element is visible unless it (or an ancestor) is [hidden].
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[hidden]") ? null : document.body;
    },
  });
});

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

/** Generates for `target` and proves the result is usable by the rest of the system. */
function selectorFor(target: Element, options?: Parameters<typeof generateSelector>[1]) {
  const result = generateSelector(target, options);
  if (!result.ok) throw new Error(`no selector: ${result.reason}`);
  expect(isCssSelector(result.selector)).toBe(true);
  expect(normalizeCheckoutSelector(result.selector)).toBe(result.selector);
  // The lookup the shopper's coupon run uses must land on the clicked element.
  expect(element(result.selector)).toBe(target);
  return result as Extract<SelectorResult, { ok: true }>;
}

describe("real checkout shapes", () => {
  it("Shopify: prefers the field name over a counter id, and tolerates the hidden mobile copy", () => {
    document.body.innerHTML = `
      <aside hidden><input id="ReductionsInput1" name="reductions" placeholder="Discount code or gift card"></aside>
      <main>
        <form>
          <input id="ReductionsInput0" name="reductions" aria-label="Discount code or gift card" placeholder="Discount code or gift card">
          <button type="submit" aria-label="Apply Discount Code" class="_1m2hr9ge _1m2hr9gd">Apply</button>
        </form>
        <div role="table"><div role="row"><span role="rowheader">Total</span><strong class="_19gi7yt0 notranslate">$84.20</strong></div></div>
      </main>`;
    const input = selectorFor($("#ReductionsInput0"));
    expect(input).toEqual({ ok: true, selector: 'input[name="reductions"]', strategy: "attribute", exact: false });
    expect(selectorFor($("button")).selector).toBe('button[aria-label="Apply Discount Code"]');
    expect(selectorFor($("strong")).selector).toBe("strong.notranslate");
  });

  it("WooCommerce classic checkout: stable ids and names", () => {
    document.body.innerHTML = `
      <form class="checkout_coupon woocommerce-form-coupon">
        <input type="text" name="coupon_code" class="input-text" id="coupon_code" placeholder="Coupon code">
        <button type="submit" class="button" name="apply_coupon" value="Apply coupon">Apply coupon</button>
      </form>
      <ul class="woocommerce-error" role="alert"><li>Coupon "x" does not exist!</li></ul>`;
    expect(selectorFor($("input")).selector).toBe("#coupon_code");
    expect(selectorFor($("button")).selector).toBe('button[name="apply_coupon"]');
    expect(selectorFor($(".woocommerce-error")).selector).toBe("ul.woocommerce-error");
  });

  it("WooCommerce block checkout: skips the counter id for the field's label", () => {
    document.body.innerHTML = `
      <div class="wc-block-components-totals-coupon">
        <div class="wc-block-components-text-input">
          <input type="text" id="wc-block-components-totals-coupon__input-0" autocomplete="off" aria-label="Enter code">
        </div>
        <button class="wc-block-components-button wp-element-button wc-block-components-totals-coupon__button contained" type="submit">Apply</button>
      </div>`;
    expect(selectorFor($("input")).selector).toBe('input[aria-label="Enter code"]');
    expect(selectorFor($("button")).selector).toBe("button.wc-block-components-button");
  });

  it("React app with hashed classes: uses the test id, or scopes under a named section", () => {
    document.body.innerHTML = `
      <section aria-label="Order summary">
        <div class="css-1x9fk2"><input class="sc-bdVaJa kGbJXV" data-testid="promo-code-input"></div>
        <button class="css-7aq3bx eYIgQK">Apply</button>
      </section>
      <section aria-label="Gift cards"><button class="css-7aq3bx eYIgQK">Apply</button></section>`;
    expect(selectorFor($("input")).selector).toBe('input[data-testid="promo-code-input"]');
    const button = selectorFor(document.querySelector('[aria-label="Order summary"] button')!);
    expect(button).toMatchObject({ selector: 'section[aria-label="Order summary"] button', strategy: "scoped", exact: true });
  });

  it("Tailwind markup: ignores utility classes but keeps the semantic one", () => {
    document.body.innerHTML = `
      <p class="text-sm font-bold md:text-lg px-4 total-price">$84.20</p>
      <p class="text-sm font-bold md:text-lg px-4">Shipping $5.00</p>`;
    expect(selectorFor($(".total-price")).selector).toBe("p.total-price");
  });

  it("falls back to a positional path when nothing on the page is stable", () => {
    document.body.innerHTML = `<div><div><button>Apply</button></div><div><button>Apply</button></div></div>`;
    const target = document.querySelectorAll("button")[1];
    expect(selectorFor(target)).toMatchObject({
      selector: "body > div > div:nth-of-type(2) > button",
      strategy: "path",
      exact: true,
    });
  });
});

describe("surviving a re-render", () => {
  it("finds the equivalent element after the store renders the checkout again", () => {
    const markup = `
      <form class="discount-form"><input class="sc-bdVaJa kGbJXV" name="discount"><button class="css-7aq3bx">Apply</button></form>
      <p class="order_summary__total">$84.20</p>`;
    document.body.innerHTML = markup;
    const selectors = ["input", "button", "p"].map((tag) => selectorFor($(tag)).selector);
    expect(selectors).toEqual(['input[name="discount"]', "form.discount-form button", "p.order_summary__total"]);

    document.body.innerHTML = markup; // brand-new nodes, as after a framework re-render
    expect(selectors.map((selector) => element(selector)?.localName)).toEqual(["input", "button", "p"]);
  });
});

describe("what never goes into a selector", () => {
  it("skips state classes, which change as the shopper interacts", () => {
    document.body.innerHTML = `<button class="is-active selected focus promo-apply">Apply</button><button class="other">x</button>`;
    expect(selectorFor($(".promo-apply")).selector).toBe("button.promo-apply");
  });

  it("skips text from this setup run, and labels that carry amounts or codes", () => {
    document.body.innerHTML = `
      <span class="tag">SAVE10<button aria-label="Remove SAVE10" class="remove-discount">x</button></span>
      <p class="banner" title="You saved $10.00">Discount applied</p>
      <p class="note">x</p>`;
    expect(selectorFor($("button"), { volatileText: ["SAVE10"] }).selector).toBe("button.remove-discount");
    expect(selectorFor($(".banner")).selector).toBe("p.banner");
  });

  it("writes unusual but stable ids as attribute selectors", () => {
    document.body.innerHTML = `<input id="checkout.promo-code"><input id="other">`;
    expect(selectorFor($("input")).selector).toBe('[id="checkout.promo-code"]');
  });

  it("never emits a value it would have to escape", () => {
    document.body.innerHTML = `<input name='code"x' placeholder="Enter \\ code" class="promo-input"><input class="x">`;
    expect(selectorFor($("input")).selector).toBe("input.promo-input");
  });
});

describe("what can't be selected", () => {
  it("reports an element inside a web component's shadow tree", () => {
    document.body.innerHTML = `<promo-box></promo-box>`;
    const root = $("promo-box").attachShadow({ mode: "open" });
    root.innerHTML = `<input name="promo">`;
    expect(generateSelector(root.querySelector("input")!)).toEqual({ ok: false, reason: "shadow-root" });
  });

  it("reports an element no longer on the page", () => {
    const input = document.createElement("input");
    expect(generateSelector(input)).toEqual({ ok: false, reason: "detached" });
  });
});

describe("generated-looking values", () => {
  it.each([":r3:", "input-4821", "9a8b7c6d-5e4f-4a3b", "TextField12", "ember123", "a1b2c3d4", "kGbJXV", "radix-:r1:", "has space"])(
    "rejects %s",
    (value) => expect(looksGenerated(value)).toBe(true),
  );
  it.each(["promo", "coupon_code", "ReductionsInput", "checkout-discount", "applyButton", "PromoCode", "deadline"])(
    "keeps %s",
    (value) => expect(looksGenerated(value)).toBe(false),
  );
  it("allows field names that end in a number", () => {
    expect(looksGenerated("address1", { counters: false })).toBe(false);
    expect(looksGenerated("address1")).toBe(true);
  });
});
