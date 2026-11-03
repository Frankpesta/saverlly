/**
 * @jest-environment jsdom
 */
import type { CheckoutRecipe } from "@saverlly/shared-types";
import {
  CheckoutActions,
  ComparisonError,
  readAppliedCodeFromRemoveControl,
  readTotal,
  setFieldValue,
} from "./checkout-actions";

// The shopper coupon run (coupon-applier.spec.ts) covers these steps in depth. This spec pins
// the contract store setup relies on when it drives CheckoutActions directly.

const RECIPE: CheckoutRecipe = {
  couponApplyMode: "remove",
  couponFieldSelector: "#promo",
  applyButtonSelector: "#apply",
  successIndicatorSelector: ".success",
  failureIndicatorSelector: ".failure",
  cartTotalSelector: "#total",
  removeCouponSelector: "#remove",
  checkoutUrlPatterns: ["/checkout"],
};

// jsdom has no layout: treat an element as visible unless it (or an ancestor) is hidden.
function visibleUnlessHidden(): void {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[hidden]") ? null : document.body;
    },
  });
}

/** A small checkout: SAVE10 takes $10 off, anything else is rejected; #remove undoes it. */
function mountCheckout(): void {
  document.body.innerHTML = `
    <div id="total">$100.00</div>
    <input id="promo">
    <button id="apply">Apply</button>
    <p class="success" hidden>Code applied</p>
    <p class="failure" hidden>That code isn't valid</p>
    <button id="remove" hidden aria-label="Remove SAVE10">x</button>`;
  const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
  $("#apply").addEventListener("click", () => {
    const ok = $<HTMLInputElement>("#promo").value === "SAVE10";
    $(".success").hidden = !ok;
    $(".failure").hidden = ok;
    $("#remove").hidden = !ok;
    if (ok) $("#total").textContent = "$90.00";
  });
  $("#remove").addEventListener("click", () => {
    $("#remove").hidden = true;
    $(".success").hidden = true;
    $("#total").textContent = "$100.00";
  });
}

beforeAll(visibleUnlessHidden);
beforeEach(() => {
  jest.useFakeTimers();
  mountCheckout();
});
afterEach(() => jest.useRealTimers());

it("reports an accepted code with its total and remembers it as applied", async () => {
  const actions = new CheckoutActions(RECIPE, () => {});
  const result = actions.attempt("SAVE10");
  await jest.advanceTimersByTimeAsync(3_000);
  await expect(result).resolves.toEqual({ outcome: "success", total: 90 });
  expect(actions.currentCode).toBe("SAVE10");
});

it("reports a rejected code without treating it as applied", async () => {
  const actions = new CheckoutActions(RECIPE, () => {});
  const result = actions.attempt("SAVERLLY-TEST-0000");
  await jest.advanceTimersByTimeAsync(3_000);
  await expect(result).resolves.toEqual({ outcome: "failure", total: 100 });
  expect(actions.currentCode).toBeNull();
});

it("removes an applied code and waits for the total to return to the baseline", async () => {
  const actions = new CheckoutActions(RECIPE, () => {});
  const applied = actions.attempt("SAVE10");
  await jest.advanceTimersByTimeAsync(3_000);
  await applied;
  const reset = actions.resetCart(100);
  await jest.advanceTimersByTimeAsync(2_000);
  await reset;
  expect(actions.currentCode).toBeNull();
  expect(readTotal(RECIPE.cartTotalSelector)).toBe(100);
});

it("aborts as soon as the caller's guard throws, before touching the page", async () => {
  const actions = new CheckoutActions(RECIPE, () => {
    throw new ComparisonError("cancelled");
  });
  await expect(actions.attempt("SAVE10")).rejects.toEqual(new ComparisonError("cancelled"));
  expect(document.querySelector<HTMLInputElement>("#promo")!.value).toBe("");
});

it("reads totals through framework input handlers and accessible duplicates", () => {
  const input = document.querySelector<HTMLInputElement>("#promo")!;
  const events: string[] = [];
  input.addEventListener("input", () => events.push("input"));
  input.addEventListener("change", () => events.push("change"));
  setFieldValue(input, "SAVE10");
  expect(input.value).toBe("SAVE10");
  expect(events).toEqual(["input", "change"]);

  document.querySelector("#total")!.innerHTML =
    '<span aria-hidden="true">$120.00</span><span>$95.50</span>';
  expect(readTotal("#total")).toBe(95.5);
  expect(readAppliedCodeFromRemoveControl("#remove")).toBe("SAVE10");
});

describe("a promo box in a drawer (Target)", () => {
  // Target opens the box in a drawer from an "Add" link. While it checks a code it swaps the
  // apply button for a spinner; a rejected code brings the button back with an error, an
  // accepted one closes the whole drawer.
  const DRAWER_RECIPE: CheckoutRecipe = {
    couponFieldSelector: "#promo",
    applyButtonSelector: "#apply",
    couponFieldRevealSelector: "#open",
    successIndicatorSelector: "",
    failureIndicatorSelector: "#promo-error",
    cartTotalSelector: "#total",
    checkoutUrlPatterns: ["/checkout"],
  };

  function mountDrawer(): void {
    document.body.innerHTML = `<div id="total">$100.00</div><button id="open">Add</button>`;
    document.querySelector("#open")!.addEventListener("click", () => {
      const drawer = document.createElement("div");
      drawer.setAttribute("role", "dialog");
      drawer.innerHTML = `<form><input id="promo"><span class="slot"><button id="apply" type="button">Add</button></span></form>`;
      document.body.append(drawer);
      const apply = drawer.querySelector<HTMLButtonElement>("#apply")!;
      apply.addEventListener("click", () => {
        const code = drawer.querySelector<HTMLInputElement>("#promo")!.value;
        drawer.querySelector("#promo-error")?.remove();
        apply.replaceWith(Object.assign(document.createElement("span"), { textContent: "Loading" }));
        setTimeout(() => {
          if (code === "SAVE10") {
            drawer.remove();
            document.querySelector("#total")!.textContent = "$90.00";
            return;
          }
          drawer.querySelector(".slot")!.replaceChildren(apply);
          drawer.querySelector("form")!.append(
            Object.assign(document.createElement("span"), { id: "promo-error", textContent: "The code is invalid or expired" }),
          );
        }, 1_000);
      });
    });
  }

  beforeEach(mountDrawer);

  it("counts an accepted code when the store closes the drawer instead of waiting it out", async () => {
    const actions = new CheckoutActions(DRAWER_RECIPE, () => {});
    const result = actions.attempt("SAVE10");
    await jest.advanceTimersByTimeAsync(4_000);
    await expect(result).resolves.toEqual({ outcome: "success", total: 90 });
    expect(actions.currentCode).toBe("SAVE10");
  });

  it("still waits through the spinner and reports a rejected code", async () => {
    const actions = new CheckoutActions(DRAWER_RECIPE, () => {});
    const result = actions.attempt("NOPE");
    await jest.advanceTimersByTimeAsync(4_000);
    await expect(result).resolves.toEqual({ outcome: "failure", total: 100 });
    expect(actions.currentCode).toBeNull();
  });
});
