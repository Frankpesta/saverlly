/**
 * @jest-environment jsdom
 */
import type { CheckoutRecipe } from "@saverlly/shared-types";
import {
  clearTestCode,
  rankMessages,
  rankRemove,
  rankSuccess,
  scanForControls,
  scanForMessages,
  settle,
  submitTestCode,
  testCode,
  watchChanges,
  watchTypedCode,
} from "./setup-learn";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[hidden]") ? null : document.body;
    },
  });
});
afterEach(() => jest.useRealTimers());

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

describe("ranking what appeared", () => {
  it("WooCommerce: the alert list beats the page chrome around it", () => {
    document.body.innerHTML = `
      <div class="woocommerce-notices-wrapper"><ul class="woocommerce-error" role="alert"><li>Coupon "SAVERLLY-TEST-AB12" does not exist!</li></ul></div>
      <form class="checkout_coupon"><input id="code"><button>Apply coupon</button></form>
      <p class="order-total">$84.20</p>`;
    const ranked = rankMessages(document.querySelectorAll("*"), $("#code"), [$("#code"), $("button"), $(".order-total")]);
    expect(ranked[0]).toBe($("ul.woocommerce-error"));
    expect(ranked).not.toContain($(".order-total"));
  });

  it("Shopify: the element the invalid box points to wins outright", () => {
    document.body.innerHTML = `
      <div class="field"><input id="ReductionsInput0" aria-invalid="true" aria-describedby="error-for-reductions">
        <p id="error-for-reductions" class="_1fragem2">Enter a valid discount code or gift card</p></div>
      <div role="status">Shipping updated</div>`;
    expect(rankMessages(document.querySelectorAll("*"), $("input"), [$("input")])[0]).toBe($("#error-for-reductions"));
  });

  it("prefers the message next to the box over a matching banner far away, and the message over its wrapper", () => {
    document.body.innerHTML = `
      <header><div class="site-banner">Some items are not available in your area</div></header>
      <main><section><div class="promo"><div><input id="code"></div>
        <div class="feedback"><span class="feedback">That code isn't valid</span></div>
      </div></section></main>`;
    const ranked = rankMessages(document.querySelectorAll("*"), $("#code"), [$("#code")]);
    expect(ranked[0]).toBe($("span.feedback"));
    expect(ranked.indexOf($(".site-banner"))).toBeGreaterThan(ranked.indexOf($("div.feedback")));
  });

  it("never offers hidden things, the box's own container, huge blocks or plain text without signals", () => {
    document.body.innerHTML = `
      <div class="error-wrapper"><input id="code"><p class="error" hidden>Invalid code</p></div>
      <p class="message">${"x ".repeat(200)}</p><p>Thanks for shopping</p>`;
    expect(rankMessages(document.querySelectorAll("*"), $("#code"), [$("#code")])).toEqual([]);
  });

  it("finds a server-rendered message after a reload, with nothing to compare against", () => {
    document.body.innerHTML = `
      <ul class="woocommerce-error" role="alert"><li>Coupon "X" does not exist!</li></ul>
      <form><input id="code"><button>Apply</button></form>`;
    expect(rankMessages(scanForMessages(), $("#code"), [$("#code"), $("button")])[0]).toBe($("ul.woocommerce-error"));
  });
});

describe("submitting a test code", () => {
  const recipe: CheckoutRecipe = {
    couponFieldSelector: "#code",
    applyButtonSelector: "#apply",
    cartTotalSelector: "#total",
    checkoutUrlPatterns: ["/checkout"],
    successIndicatorSelector: "",
    failureIndicatorSelector: "",
  };
  function store(answer: (code: string) => void) {
    document.body.innerHTML = `
      <div class="promo"><input id="code"><button id="apply">Apply</button><p class="hint">Codes are case-sensitive</p></div>
      <p id="total">$84.20</p>`;
    $("#apply").addEventListener("click", () => setTimeout(() => answer($<HTMLInputElement>("#code").value), 400));
  }

  it("returns what the store showed in answer, leaving the code in place until confirmed", async () => {
    jest.useFakeTimers();
    store((code) => {
      const p = document.createElement("p");
      p.className = "promo-error";
      p.textContent = `"${code}" isn't a valid code`;
      $(".promo").append(p);
    });
    const result = submitTestCode(recipe, "SAVERLLY-TEST-AB12", () => {});
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual({ kind: "answered", candidates: [$(".promo-error")] });
    expect($<HTMLInputElement>("#code").value).toBe("SAVERLLY-TEST-AB12");

    clearTestCode("#code", "SAVERLLY-TEST-AB12");
    expect($<HTMLInputElement>("#code").value).toBe("");
  });

  it("says when the store accepted the made-up code", async () => {
    jest.useFakeTimers();
    store(() => ($("#total").textContent = "$74.20"));
    const result = submitTestCode(recipe, "SAVERLLY-TEST-AB12", () => {});
    await jest.advanceTimersByTimeAsync(9_000);
    await expect(result).resolves.toEqual({ kind: "accepted" });
  });

  it("gives up waiting after a while when nothing appears", async () => {
    jest.useFakeTimers();
    store(() => {});
    const result = submitTestCode(recipe, "SAVERLLY-TEST-AB12", () => {});
    await jest.advanceTimersByTimeAsync(9_000);
    await expect(result).resolves.toEqual({ kind: "answered", candidates: [] });
  });

  it("reports a missing box and an apply button that never enables", async () => {
    jest.useFakeTimers();
    document.body.innerHTML = `<p id="total">$1.00</p>`;
    await expect(submitTestCode(recipe, "X", () => {})).resolves.toEqual({ kind: "no-field" });

    document.body.innerHTML = `<input id="code"><button id="apply" disabled>Apply</button><p id="total">$1.00</p>`;
    const result = submitTestCode(recipe, "SAVERLLY-TEST-AB12", () => {});
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toEqual({ kind: "button-disabled" });
    expect($<HTMLInputElement>("#code").value).toBe("");
  });

  it("stops when the caller's guard throws", async () => {
    jest.useFakeTimers();
    store(() => {});
    let stop = false;
    const result = submitTestCode(recipe, "SAVERLLY-TEST-AB12", () => {
      if (stop) throw new Error("stopped");
    });
    stop = true;
    const settled = expect(result).rejects.toThrow("stopped");
    await jest.advanceTimersByTimeAsync(1_000);
    await settled;
  });

  it("never clears a code that isn't the test code", () => {
    document.body.innerHTML = `<input id="code" value="SHOPPER10">`;
    clearTestCode("#code", "SAVERLLY-TEST-AB12");
    expect($<HTMLInputElement>("#code").value).toBe("SHOPPER10");
  });
});

it("makes test codes no store would issue", () => {
  expect(testCode()).toMatch(/^SAVERLLY-TEST-[A-HJKMNP-Z2-9]{4}$/);
  expect(testCode(() => 0)).toBe("SAVERLLY-TEST-AAAA");
});

describe("a working code the admin applied", () => {
  it("finds the chip that names the code before a generic banner, and never an error", () => {
    document.body.innerHTML = `
      <div class="banner">Free shipping on all orders!</div>
      <div class="promo"><input id="code"><button id="apply">Apply</button>
        <p class="promo-error">That code isn't valid</p>
        <div class="tag"><span class="tag-text">SAVE10</span><button aria-label="Remove SAVE10" class="tag-remove">×</button></div>
        <p class="discount-line">Discount applied: −$10.00</p>
      </div>
      <p id="total">$74.20</p>`;
    const excluded = [$("#code"), $("#apply"), $("#total")];
    const ranked = rankSuccess(document.querySelectorAll("*"), $("#code"), excluded, "SAVE10");
    expect(ranked[0]).toBe($(".tag-text"));
    expect(ranked).toContain($(".discount-line"));
    expect(ranked).not.toContain($(".promo-error"));
    expect(ranked).not.toContain($(".banner"));
    expect(ranked).not.toContain($(".tag-remove"));
  });

  it("works when the store removed the promo box once the code applied", () => {
    document.body.innerHTML = `<div role="status" class="applied">Code SAVE10 applied</div>`;
    expect(rankSuccess(document.querySelectorAll("*"), null, [], "SAVE10")[0]).toBe($(".applied"));
  });

  it("finds the control that removes the code, not one that removes a cart item", () => {
    document.body.innerHTML = `
      <ul class="items"><li>Shoes <button class="item-remove">Remove</button></li></ul>
      <div class="tag">SAVE10 <a href="#" class="tag-x" aria-label="Remove SAVE10">×</a></div>
      <a href="#" class="close">×</a>`;
    expect(rankRemove(scanForControls(), [], "SAVE10")[0]).toBe($(".tag-x"));
    // Without the code to go on, an × alone isn't enough.
    expect(rankRemove([$(".close")], [], "SAVE10")).toEqual([]);
  });

  it("captures the code as typed, even after the store empties the box", () => {
    document.body.innerHTML = `<input id="code"><input id="other">`;
    const seen: string[] = [];
    const typed = watchTypedCode("#code", (code) => seen.push(code));
    const type = (selector: string, value: string) => {
      const field = $<HTMLInputElement>(selector);
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    type("#code", "SAVE");
    type("#code", "SAVE10");
    type("#other", "nope");
    $<HTMLInputElement>("#code").value = "";
    expect(typed.current()).toBe("SAVE10");
    expect(seen).toEqual(["SAVE", "SAVE10"]);
    typed.stop();
    type("#code", "LATER");
    expect(typed.current()).toBe("SAVE10");
  });

  it("settles once the page has been quiet, or gives up", async () => {
    jest.useFakeTimers();
    document.body.innerHTML = `<p id="x"></p>`;
    const watch = watchChanges();
    let done = false;
    void settle(watch, () => {}, { minMs: 300, maxMs: 5_000 }).then(() => (done = true));
    await jest.advanceTimersByTimeAsync(400);
    $("#x").textContent = "still updating";
    await jest.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(400);
    expect(done).toBe(true);
    watch.stop();
  });
});
