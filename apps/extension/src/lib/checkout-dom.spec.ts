/** @jest-environment jsdom */
import { element, elements } from "./checkout-dom";

it("repairs Target selectors copied with JSON-escaped attribute quotes", () => {
  document.body.innerHTML =
    '<input data-test="promo-code-input"><div data-test="cart-summary-total">$50</div>';
  expect(element('input[data-test=\\"promo-code-input\\"]')).toBe(
    document.querySelector("input"),
  );
  expect(element('[data-test=\\"cart-summary-total\\"]')?.textContent).toBe(
    "$50",
  );
});
it("allows absent success selectors and rejects malformed selectors without throwing", () => {
  expect(elements("")).toEqual([]);
  expect(elements("[")).toEqual([]);
});
it("prefers the visible coupon control when desktop/mobile copies coexist", () => {
  document.body.innerHTML =
    '<input class="coupon" hidden><input class="coupon" id="visible">';
  const visible = document.getElementById("visible")!;
  Object.defineProperty(visible, "offsetParent", { value: document.body });
  expect(element(".coupon")).toBe(visible);
});
