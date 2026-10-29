/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.test/checkouts/cn/abc123/information"}
 */
import { PLATFORM_TEMPLATES } from "@saverlly/shared-types";
import { detectPagePlatform, matchTemplate, templateFor } from "./setup-template";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[hidden]") ? null : document.body;
    },
  });
});

const SHOPIFY = `
  <script src="https://cdn.shopify.com/s/checkout.js"></script>
  <form id="discount"><input name="reductions" placeholder="Discount code"><button type="submit">Apply</button></form>
  <span class="payment-due__price">$84.20</span>`;

const template = (platform: "SHOPIFY" | "WOOCOMMERCE" | "BIGCOMMERCE") => PLATFORM_TEMPLATES[platform]!;

beforeEach(() => history.replaceState(null, "", "/checkouts/cn/abc123/information"));

it("recognises the platform from the live page", () => {
  document.body.innerHTML = SHOPIFY;
  expect(detectPagePlatform()).toBe("SHOPIFY");
  document.body.innerHTML = "<p>Our own shop</p>";
  expect(detectPagePlatform()).toBeNull();
});

it("only offers templates for platforms that have one", () => {
  expect(templateFor("SHOPIFY")).not.toBeNull();
  expect(templateFor("WIX")).toBeNull();
  expect(templateFor(null)).toBeNull();
});

it("fills in every part a Shopify checkout shows", async () => {
  document.body.innerHTML = SHOPIFY;
  expect(await matchTemplate(template("SHOPIFY"))).toEqual({
    pattern: "/checkouts/",
    reveal: "visible",
    picks: {
      promoField: { selector: 'input[name="reductions"]', strategy: "template", exact: true },
      applyButton: {
        selector: 'form:has(input[name="reductions"]) button[type="submit"]',
        strategy: "template",
        exact: true,
      },
      cartTotal: { selector: ".payment-due__price", strategy: "template", exact: true },
    },
  });
});

it("opens a WooCommerce promo box hidden behind the platform's own link", async () => {
  history.replaceState(null, "", "/checkout/");
  document.body.innerHTML = `
    <div class="woocommerce-form-coupon-toggle"><a href="#" class="showcoupon">Click here to enter your code</a></div>
    <form class="checkout_coupon" hidden><input id="coupon_code" name="coupon_code"><button name="apply_coupon">Apply coupon</button></form>
    <table><tr class="order-total"><td><span class="woocommerce-Price-amount amount">$84.20</span></td></tr></table>`;
  document.querySelector(".showcoupon")!.addEventListener("click", (event) => {
    event.preventDefault();
    (document.querySelector(".checkout_coupon") as HTMLElement).hidden = false;
  });
  const match = await matchTemplate(template("WOOCOMMERCE"));
  expect(match).toMatchObject({
    pattern: "/checkout",
    reveal: "link",
    picks: {
      revealLink: { selector: "a.showcoupon" },
      promoField: { selector: "#coupon_code" },
      applyButton: { selector: 'button[name="apply_coupon"]' },
      cartTotal: { selector: "tr.order-total .woocommerce-Price-amount" },
    },
  });
});

it("leaves out anything ambiguous, of the wrong kind, or not a price", async () => {
  document.body.innerHTML = `
    <script src="https://cdn.shopify.com/s/checkout.js"></script>
    <input name="reductions"><input name="reductions">
    <div class="payment-due__price">Calculated at next step</div>`;
  const match = await matchTemplate(template("SHOPIFY"));
  // Two promo boxes: neither is trusted, so neither is the apply button next to it.
  expect(match.picks).toEqual({});
  expect(match.reveal).toBeUndefined();
});

it("leaves the checkout page to the admin when the address isn't the platform's usual one", async () => {
  history.replaceState(null, "", "/secure/pay");
  document.body.innerHTML = SHOPIFY;
  const match = await matchTemplate(template("SHOPIFY"));
  expect(match.pattern).toBeUndefined();
  expect(match.picks.promoField).toBeDefined();
});

it("gives up on a hidden box whose link doesn't open it", async () => {
  history.replaceState(null, "", "/checkout/");
  document.body.innerHTML = `
    <a href="#" class="showcoupon">Click here to enter your code</a>
    <form hidden><input id="coupon_code"></form>`;
  document.querySelector(".showcoupon")!.addEventListener("click", (event) => event.preventDefault());
  const match = await matchTemplate(template("WOOCOMMERCE"), { revealWaitMs: 300 });
  expect(match.reveal).toBeUndefined();
  expect(match.picks).toEqual({});
});
