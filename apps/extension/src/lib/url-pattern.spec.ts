import { matchesCheckoutUrl } from "./checkout-match";
import { checkoutUrlPattern, isVariableSegment } from "./url-pattern";

const pattern = (href: string) => {
  const result = checkoutUrlPattern(href);
  if (!result.ok) throw new Error(`no pattern for ${href}: ${result.reason}`);
  return result.pattern;
};

describe("checkout URL patterns", () => {
  it.each([
    // Shopify (current and legacy), with session tokens and steps.
    ["https://shop.test/checkouts/c/8f2a9b1c4d5e6f708192a3b4c5d6e7f8/information", "/checkouts/c"],
    ["https://shop.test/checkouts/cn/hWN2abCdEf3GhIjK4lMn/en-us?_r=AQAB", "/checkouts"],
    ["https://shop.test/12345678/checkouts/a1b2c3d4e5f6a7b8c9d0?step=payment_method", "/*/checkouts"],
    // WooCommerce, Magento, BigCommerce and plain stores.
    ["https://shop.test/checkout/", "/checkout"],
    ["https://shop.test/checkout/order-pay/4821/?pay_for_order=true&key=wc_order_x", "/checkout/order-pay"],
    ["https://shop.test/checkout/#shipping", "/checkout"],
    ["https://shop.test/checkout.php", "/checkout.php"],
    ["https://shop.test/cart", "/cart"],
    // Locales, numbered steps and hash-routed single-page checkouts.
    ["https://shop.test/en-gb/checkout/step-2", "/checkout"],
    ["https://shop.test/fr_ca/cart/view", "/cart/view"],
    ["https://shop.test/#/checkout/payment", "/checkout"],
    ["https://shop.test/Checkout/Review", "/checkout"],
    // A page whose only fixed segment is itself a step word keeps it.
    ["https://shop.test/payment", "/payment"],
    ["https://shop.test/en-us/payment/9f8e7d6c5b4a", "/payment"],
  ])("%s → %s", (href, expected) => {
    expect(pattern(href)).toBe(expected);
  });

  it.each([
    "https://shop.test/",
    "https://shop.test/en-us",
    "https://shop.test/8f2a9b1c4d5e6f70",
    "https://shop.test/#/",
  ])("refuses %s, which would match every page", (href) => {
    expect(checkoutUrlPattern(href)).toEqual({ ok: false, reason: "too-broad" });
  });

  it("rejects something that is not a URL", () => {
    expect(checkoutUrlPattern("not a url")).toEqual({ ok: false, reason: "invalid-url" });
  });

  it("matches the page it came from and other shoppers' sessions, but not unrelated pages", () => {
    const source = "https://shop.test/checkouts/c/8f2a9b1c4d5e6f708192a3b4c5d6e7f8/information";
    const result = pattern(source);
    expect(matchesCheckoutUrl(source, [result])).toBe(true);
    expect(matchesCheckoutUrl("https://shop.test/checkouts/c/0011aa22bb33cc44dd55/shipping", [result])).toBe(true);
    expect(matchesCheckoutUrl("https://shop.test/products/shoes", [result])).toBe(false);
    expect(matchesCheckoutUrl("https://shop.test/account", [result])).toBe(false);
  });

  it("never keeps session-specific values in the pattern", () => {
    for (const href of [
      "https://shop.test/checkout/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/payment",
      "https://shop.test/basket/123456/checkout",
    ])
      expect(pattern(href)).not.toMatch(/\d{3,}|[0-9a-f]{8}/);
  });
});

describe("variable path segments", () => {
  it.each(["4821", "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", "8f2a9b1c", "hwn2abcdef3ghijk", "x".repeat(41)])(
    "treats %s as variable",
    (segment) => expect(isVariableSegment(segment)).toBe(true),
  );
  it.each(["checkout", "checkouts", "c", "cart", "order-pay", "checkout.php", "step-2", "onepage", "deadbeef"])(
    "keeps %s",
    (segment) => expect(isVariableSegment(segment)).toBe(false),
  );
});
