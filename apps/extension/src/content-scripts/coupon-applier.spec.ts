/**
 * @jest-environment jsdom
 */
import {
  CouponSource,
  type CheckoutRecipe,
  type PublicCoupon,
} from "@saverlly/shared-types";

declare function require(id: string): unknown;

const sendMessage = jest.fn();
(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  runtime: { sendMessage },
} as unknown as typeof chrome;

const RECIPE: CheckoutRecipe = {
  couponApplyMode: "replace",
  couponFieldSelector: 'input[data-test="promo-code-input"]',
  applyButtonSelector: 'button[data-test="apply-promo-code-button"]',
  successIndicatorSelector: ".success",
  failureIndicatorSelector: ".failure",
  cartTotalSelector: "#cart-total",
  checkoutUrlPatterns: ["/checkout"],
};

const COUPON: PublicCoupon = {
  id: "coupon-1",
  merchantId: "merchant-1",
  code: "SAVE10",
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
  require("./coupon-applier");
}

beforeEach(() => {
  sendMessage.mockClear();
  document.body.innerHTML = "";
  window.__SAVERLLY__ = undefined;
  window.__SAVERLLY_APPLYING__ = false;
});

it("preserves reusable indicator nodes and waits for delayed totals after success", async () => {
  jest.useFakeTimers();
  window.__SAVERLLY__ = {
    merchantId: "merchant-1",
    recipe: RECIPE,
    coupons: [COUPON],
  };
  document.body.innerHTML =
    '<div id="cart-total">$100.00</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button"></button><div class="success" hidden>Applied</div><div class="failure" hidden>Invalid</div>';
  const success = document.querySelector<HTMLElement>(".success")!;
  const failure = document.querySelector<HTMLElement>(".failure")!;
  Object.defineProperty(success, "offsetParent", {
    get: () => (success.hidden ? null : document.body),
  });
  document.querySelector("button")!.addEventListener("click", () => {
    success.hidden = false;
    setTimeout(() => {
      document.querySelector("#cart-total")!.textContent = "$90.00";
    }, 750);
  });
  loadContentScript();
  await jest.advanceTimersByTimeAsync(2000);
  expect(document.querySelector(".success")).toBe(success);
  expect(document.querySelector(".failure")).toBe(failure);
  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ result: "applied", discountAmount: 10 }),
  );
});

it("uses the native input setter so controlled inputs receive the changed value", async () => {
  jest.useFakeTimers();
  window.__SAVERLLY__ = {
    merchantId: "merchant-1",
    recipe: RECIPE,
    coupons: [COUPON],
  };
  document.body.innerHTML =
    '<div id="cart-total">$100.00</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button"></button>';
  const field = document.querySelector("input")!;
  const instanceSetter = jest.fn();
  Object.defineProperty(field, "value", {
    get: () =>
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.get!.call(field),
    set: instanceSetter,
    configurable: true,
  });
  const input = jest.fn();
  field.addEventListener("input", input);
  loadContentScript();
  await jest.advanceTimersByTimeAsync(4500);
  expect(instanceSetter).not.toHaveBeenCalled();
  expect(input).toHaveBeenCalledTimes(1);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("coupon-applier content script — click-to-reveal coupon fields", () => {
  // Regression test for a live Target checkout bug: the promo code input and apply button
  // aren't in the DOM at all until a "+ Add promo code" trigger is clicked. Without the
  // reveal step, document.querySelector(recipe.couponFieldSelector) is permanently null.
  it("clicks the reveal trigger and finds the field it renders before typing into it", async () => {
    jest.useFakeTimers();
    const recipe = {
      ...RECIPE,
      couponFieldRevealSelector: "#add-promo-code-btn",
    };
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe,
      coupons: [COUPON],
    };
    document.body.innerHTML =
      '<div id="cart-total">$40.05</div><button id="add-promo-code-btn"></button>';
    document
      .querySelector("#add-promo-code-btn")!
      .addEventListener("click", () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          '<input data-test="promo-code-input" /><button data-test="apply-promo-code-button"></button>',
        );
      });

    loadContentScript();
    await jest.advanceTimersByTimeAsync(4_000); // let waitForIndicator's poll loop exhaust and resolve

    const field = document.querySelector<HTMLInputElement>(
      'input[data-test="promo-code-input"]',
    );
    expect(field?.value).toBe("SAVE10");
  });

  it("reports checkout_changed if the reveal trigger never renders the coupon field", async () => {
    jest.useFakeTimers();
    const recipe = {
      ...RECIPE,
      couponFieldRevealSelector: "#add-promo-code-btn",
    };
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe,
      coupons: [COUPON],
    };
    // Trigger exists but (unlike the test above) does nothing on click — the field never appears.
    document.body.innerHTML =
      '<div id="cart-total">$40.05</div><button id="add-promo-code-btn"></button>';

    loadContentScript();
    await jest.advanceTimersByTimeAsync(16_000);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "COUPON_APPLY_RESULT",
        result: "failed",
        failureReason: "checkout_changed",
      }),
    );
  });

  it("does not attempt a reveal click when couponFieldRevealSelector is unset (unchanged behavior)", async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: RECIPE,
      coupons: [COUPON],
    };
    // No coupon field anywhere, and no reveal trigger configured.
    document.body.innerHTML = '<div id="cart-total">$40.05</div>';

    loadContentScript();
    await jest.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "COUPON_APPLY_RESULT",
        result: "failed",
        failureReason: "checkout_changed",
      }),
    );
  });
});

describe("coupon-applier content script — stale indicator from a prior failed attempt", () => {
  it("continues after a Cure-style rejection toast clears the input and disables Apply", async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: {
        ...RECIPE,
        failureIndicatorSelector:
          '[role="status"]:has(strong[style*="text-transform:uppercase"]):has(button[aria-label="Close"])',
      },
      coupons: [COUPON, { ...COUPON, id: "second", code: "WORKS" }],
    };
    document.body.innerHTML =
      '<div id="cart-total">$88.99</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button">Apply</button>';
    const field = document.querySelector("input")!;
    const button = document.querySelector("button")!;
    field.oninput = () => {
      button.disabled = !field.value;
    };
    button.onclick = () => {
      const code = field.value;
      button.disabled = true;
      setTimeout(() => {
        field.value = "";
        if (code === "WORKS") {
          document.querySelector("#cart-total")!.textContent = "$71.20";
        } else {
          document.body.insertAdjacentHTML(
            "beforeend",
            '<div role="status"><strong style="text-transform:uppercase">SAVE10</strong> discount code isn’t valid for the items in your cart<button aria-label="Close">×</button></div>',
          );
          Object.defineProperty(
            document.querySelector('[role="status"]')!,
            "offsetParent",
            { value: document.body },
          );
        }
      }, 500);
    };
    loadContentScript();
    await jest.advanceTimersByTimeAsync(6000);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "SAVE10",
        result: "failed",
        isFinal: false,
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "WORKS",
        result: "applied",
        comparisonComplete: true,
        isFinal: true,
        discountAmount: 17.79,
      }),
    );
  });

  it("finishes repeated comparisons when cached rejections finish between polls", async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: RECIPE,
      coupons: [COUPON, { ...COUPON, id: "second", code: "OTHER" }],
    };
    document.body.innerHTML =
      '<div id="cart-total">$100</div><input data-test="promo-code-input" value="SAVE10"><button data-test="apply-promo-code-button">Add</button><div class="failure">Not applicable</div>';
    Object.defineProperty(document.querySelector(".failure")!, "offsetParent", {
      value: document.body,
    });
    const field = document.querySelector("input")!;
    const button = document.querySelector("button")!;
    const edits: string[] = [];
    const clicks: string[] = [];
    field.addEventListener("input", () => edits.push(field.value));
    button.onclick = () => {
      clicks.push(field.value);
      // Busy starts and finishes before the next polling tick; the error node
      // and text remain identical, as with a cached merchant rejection.
      setTimeout(() => {
        button.disabled = true;
      }, 20);
      setTimeout(() => {
        button.disabled = false;
      }, 70);
    };
    for (let run = 0; run < 2; run++) {
      loadContentScript();
      await jest.advanceTimersByTimeAsync(10000);
      expect(
        sendMessage.mock.calls.map(([m]) => m).filter((m) => m.isFinal),
      ).toEqual([
        expect.objectContaining({ result: "failed", comparisonComplete: true }),
      ]);
      sendMessage.mockClear();
    }
    expect(clicks).toEqual(["SAVE10", "OTHER", "SAVE10", "OTHER"]);
    expect(edits).toEqual([
      "",
      "SAVE10",
      "",
      "OTHER",
      "",
      "SAVE10",
      "",
      "OTHER",
    ]);
  });

  // Regression test for a live Allbirds checkout bug: the site's own error banner for a failed
  // code (e.g. "Enter a valid discount code") is never removed or hidden once a later, different
  // code succeeds -- confirmed live, not just assumed. Without clearing it before each new
  // attempt, waitForIndicator's very first poll tick for the next coupon sees that leftover
  // failure element (already visible from the previous attempt) and reports the new attempt as
  // failed before its own real outcome -- which takes a moment to render -- has any chance to.
  it("does not let a previous failure banner preempt the next coupon actually succeeding", async () => {
    jest.useFakeTimers();
    const badCoupon: PublicCoupon = {
      ...COUPON,
      id: "coupon-bad",
      code: "BAD",
    };
    const workingCoupon: PublicCoupon = {
      ...COUPON,
      id: "coupon-works",
      code: "WORKS10",
    };
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: RECIPE,
      coupons: [badCoupon, workingCoupon],
    };
    document.body.innerHTML =
      '<div id="cart-total">$40.05</div>' +
      '<input data-test="promo-code-input" />' +
      '<button data-test="apply-promo-code-button"></button>';

    // jsdom has no layout engine -- offsetParent is always null regardless of real DOM
    // presence, so isVisible()'s real check needs a stand-in here to exercise it at all.
    function markVisible(selector: string): void {
      Object.defineProperty(document.querySelector(selector)!, "offsetParent", {
        value: document.body,
        configurable: true,
      });
    }

    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        const code = document.querySelector<HTMLInputElement>(
          'input[data-test="promo-code-input"]',
        )!.value;
        if (code === "BAD") {
          // The site's own error banner -- left in the DOM indefinitely, exactly like the real
          // Allbirds checkout leaves "Enter a valid discount code or gift card" on screen.
          document.body.insertAdjacentHTML(
            "beforeend",
            '<div class="failure">Enter a valid code</div>',
          );
          markVisible(".failure");
          return;
        }
        // A real checkout takes a moment to confirm a valid code -- this delay is the window
        // during which a stale, still-visible failure element from the previous attempt would
        // otherwise win the race.
        setTimeout(() => {
          document.querySelector("#cart-total")!.textContent = "$36.05";
          document.body.insertAdjacentHTML(
            "beforeend",
            '<div class="success">Applied!</div>',
          );
          markVisible(".success");
        }, 500);
      });

    loadContentScript();
    await jest.advanceTimersByTimeAsync(4_500);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "COUPON_APPLY_RESULT",
        code: "BAD",
        result: "failed",
      }),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "COUPON_APPLY_RESULT",
        code: "WORKS10",
        result: "applied",
        isFinal: true,
      }),
    );
  });
});

describe("largest confirmed saving", () => {
  it("finishes successfully when the store clears the input and disables Apply after success", async () => {
    checkout({ WORKS10: 10 });
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        document.querySelector("input")!.value = "";
        document.querySelector<HTMLButtonElement>("button")!.disabled = true;
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(3000);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        discountAmount: 10,
      }),
    );
  });
  it("reads Shopify’s accessible current total instead of its aria-hidden animated old price", async () => {
    const { clicks } = checkout({ FIRST10: 10, BEST30: 30 });
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        const current = document.querySelector("#cart-total")!.textContent;
        document.querySelector("#cart-total")!.innerHTML =
          `<span aria-hidden="true">$100.00</span><strong>${current}</strong>`;
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(10000);
    expect(clicks).toEqual(["FIRST10", "BEST30"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        code: "BEST30",
        discountAmount: 30,
      }),
    );
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
  it("waits for a slow store response instead of reporting failure before the code applies", async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: { ...RECIPE, successIndicatorSelector: "" },
      coupons: [COUPON],
    };
    document.body.innerHTML =
      '<div id="cart-total">$100</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button">Apply</button>';
    document.querySelector("button")!.onclick = () => {
      setTimeout(() => {
        document.querySelector("#cart-total")!.textContent = "$90";
      }, 4500);
    };
    loadContentScript();
    await jest.advanceTimersByTimeAsync(7000);
    const finals = sendMessage.mock.calls
      .map(([m]) => m)
      .filter((m) => m.isFinal);
    expect(finals).toEqual([
      expect.objectContaining({ result: "applied", discountAmount: 10 }),
    ]);
  });

  it("keeps an earlier confirmed winner when a later code times out", async () => {
    const { clicks } = checkout({ BEST30: 30, SILENT: 0 });
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        if (document.querySelector("input")!.value === "SILENT")
          document.querySelector<HTMLElement>(".failure")!.hidden = true;
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(20000);
    expect(clicks).toEqual(["BEST30", "SILENT"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        code: "BEST30",
        comparisonComplete: false,
        discountAmount: 30,
      }),
    );
  });

  it("reports the actual final saving when the re-applied winner settles to a different discounted total", async () => {
    const { clicks } = checkout({ BEST30: 30, LAST10: 10 });
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        if (clicks.filter((code) => code === "BEST30").length === 2)
          document.querySelector("#cart-total")!.textContent = "$71";
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(15000);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        code: "BEST30",
        discountAmount: 29,
        newTotal: 71,
      }),
    );
  });

  it("does not mistake an ancestor layout update for a fresh stale failure banner", async () => {
    jest.useFakeTimers();
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: RECIPE,
      coupons: [COUPON],
    };
    document.body.innerHTML =
      '<div id="cart-total">$100</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button">Apply</button><section><div class="failure">Old error</div></section>';
    Object.defineProperty(document.querySelector(".failure")!, "offsetParent", {
      value: document.body,
    });
    document.querySelector("button")!.onclick = () => {
      document.querySelector("section")!.style.opacity = "0.9";
      setTimeout(() => {
        document.querySelector("#cart-total")!.textContent = "$90";
      }, 2000);
    };
    loadContentScript();
    await jest.advanceTimersByTimeAsync(5000);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        discountAmount: 10,
      }),
    );
  });

  function checkout(
    discounts: Record<string, number>,
    mode: "replace" | "remove" = "replace",
  ) {
    jest.useFakeTimers();
    const clicks: string[] = [];
    window.__SAVERLLY__ = {
      merchantId: "merchant-1",
      recipe: {
        ...RECIPE,
        couponApplyMode: mode,
        ...(mode === "remove" ? { removeCouponSelector: "#remove" } : {}),
      },
      coupons: Object.keys(discounts).map((code, i) => ({
        ...COUPON,
        code,
        id: `c${i}`,
      })),
    };
    document.body.innerHTML =
      '<div id="cart-total">$100.00</div><input data-test="promo-code-input"><button data-test="apply-promo-code-button"></button><div class="success" hidden></div><div class="failure" hidden></div><button id="remove" hidden>Remove</button>';
    const success = document.querySelector<HTMLElement>(".success")!;
    const failure = document.querySelector<HTMLElement>(".failure")!;
    const remove = document.querySelector<HTMLElement>("#remove")!;
    for (const el of [success, failure, remove])
      Object.defineProperty(el, "offsetParent", {
        get: () => (el.hidden ? null : document.body),
      });
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        const code = document.querySelector("input")!.value;
        clicks.push(code);
        success.hidden = true;
        failure.hidden = true;
        if (discounts[code] > 0) {
          document.querySelector("#cart-total")!.textContent =
            `$${100 - discounts[code]}`;
          success.hidden = false;
          remove.hidden = false;
        } else failure.hidden = false;
      });
    remove.addEventListener("click", () => {
      clicks.push("REMOVE");
      remove.hidden = true;
      success.hidden = true;
      setTimeout(() => {
        document.querySelector("#cart-total")!.textContent = "$100.00";
      }, 250);
    });
    return { clicks, discounts, remove };
  }

  it("tests past the first success, reapplies an earlier winner, and emits one final savings result", async () => {
    const { clicks } = checkout({
      FIRST10: 10,
      BEST30: 30,
      BAD: 0,
      LAST20: 20,
    });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(15000);
    expect(clicks).toEqual(["FIRST10", "BEST30", "BAD", "LAST20", "BEST30"]);
    const final = sendMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.isFinal);
    expect(final).toEqual([
      expect.objectContaining({
        code: "BEST30",
        result: "applied",
        discountAmount: 30,
        originalTotal: 100,
        newTotal: 70,
        testedCount: 4,
      }),
    ]);
  });

  it("restores the baseline between non-stacking tests in remove mode", async () => {
    const { clicks } = checkout({ BEST30: 30, LAST10: 10 }, "remove");
    loadContentScript();
    await jest.advanceTimersByTimeAsync(15000);
    expect(clicks).toEqual(["BEST30", "REMOVE", "LAST10", "REMOVE", "BEST30"]);
    expect(document.querySelector("#cart-total")!.textContent).toBe("$70");
  });

  it("keeps the first winner on equal monetary savings", async () => {
    const { clicks } = checkout({ FIRST20: 20, SECOND20: 20 });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(15000);
    expect(clicks).toEqual(["FIRST20", "SECOND20", "FIRST20"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        code: "FIRST20",
        discountAmount: 20,
      }),
    );
  });

  it("compares and reapplies the winner when Shopify appends a savings row after the total", async () => {
    const { clicks } = checkout({ BEST30: 30, LAST10: 10 });
    const total = document.querySelector("#cart-total")!;
    total.outerHTML =
      '<div role="table" aria-labelledby="MoneyLine-Heading"><div role="row"><div role="rowheader">Subtotal</div><div role="cell">$100</div></div><div role="row"><div role="rowheader">Total</div><div role="cell" id="cart-total">$100</div></div></div>';
    window.__SAVERLLY__!.recipe.cartTotalSelector =
      '[role="table"] [role="row"]:last-child [role="cell"]';
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        if (!document.querySelector("#savings-row"))
          document
            .querySelector('[role="table"]')!
            .insertAdjacentHTML(
              "beforeend",
              '<div role="row" id="savings-row"><div role="rowheader">TOTAL SAVINGS $30</div><div role="cell"></div></div>',
            );
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(20000);
    expect(clicks).toEqual(["BEST30", "LAST10", "BEST30"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        code: "BEST30",
        originalTotal: 100,
        newTotal: 70,
        discountAmount: 30,
        incrementalSavings: 30,
      }),
    );
  });

  it("does not claim success when the winner fails during reapplication", async () => {
    const { discounts } = checkout({ BEST30: 30, LAST10: 10 }, "remove");
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        if (document.querySelector("input")!.value === "LAST10")
          discounts.BEST30 = 0;
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(15000);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "failed",
        failureReason: "restore_failed",
      }),
    );
    expect(
      sendMessage.mock.calls.some(([m]) => m.isFinal && m.result === "applied"),
    ).toBe(false);
  });

  it.each<{
    discounts: Record<string, number>;
    winner: string;
    saving: number;
  }>([
    {
      discounts: { FIRST: 10, BEST: 30, LAST: 20 },
      winner: "BEST",
      saving: 30,
    },
    { discounts: { FIRST: 20, EQUAL: 20 }, winner: "FIRST", saving: 20 },
    { discounts: { BAD: 0, GOOD: 15, BAD2: 0 }, winner: "GOOD", saving: 15 },
    { discounts: { PENNY: 0.01, BAD: 0 }, winner: "PENNY", saving: 0.01 },
    { discounts: { FREE: 100, BAD: 0 }, winner: "FREE", saving: 100 },
  ])(
    "independently compares remove-mode candidates: $winner",
    async ({ discounts, winner, saving }) => {
      const { clicks } = checkout(discounts, "remove");
      loadContentScript();
      await jest.advanceTimersByTimeAsync(30000);
      expect(
        clicks
          .filter((code) => code !== "REMOVE")
          .slice(0, Object.keys(discounts).length),
      ).toEqual(Object.keys(discounts));
      const finals = sendMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => message.isFinal);
      expect(finals).toEqual([
        expect.objectContaining({
          result: "applied",
          code: winner,
          comparisonComplete: true,
          discountAmount: saving,
        }),
      ]);
    },
  );

  it.each([0, 10])(
    "restores an unlisted shopper coupon when candidates save only %s",
    async (saving) => {
      const { clicks, discounts, remove } = checkout(
        { CANDIDATE: saving },
        "remove",
      );
      discounts.SHOPPER30 = 30;
      remove.hidden = false;
      remove.setAttribute("aria-label", "Remove SHOPPER30");
      document.querySelector<HTMLElement>(".success")!.hidden = false;
      document.querySelector("#cart-total")!.textContent = "$70";
      loadContentScript();
      await jest.advanceTimersByTimeAsync(20000);
      expect(clicks.at(-1)).toBe("SHOPPER30");
      expect(document.querySelector("#cart-total")!.textContent).toBe("$70");
      expect(
        sendMessage.mock.calls.filter(
          ([m]) => m.isFinal && m.result === "applied",
        ),
      ).toHaveLength(0);
    },
  );

  it("restores an existing code after the first candidate times out with no active request", async () => {
    const { clicks, discounts, remove } = checkout({ SILENT: 0 }, "remove");
    discounts.SHOPPER30 = 30;
    remove.hidden = false;
    remove.setAttribute("aria-label", "Remove SHOPPER30");
    document.querySelector("#cart-total")!.textContent = "$70";
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () => {
        if (document.querySelector("input")!.value === "SILENT")
          document.querySelector<HTMLElement>(".failure")!.hidden = true;
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(22000);
    expect(clicks).toEqual(["REMOVE", "SILENT", "SHOPPER30"]);
    expect(document.querySelector("#cart-total")!.textContent).toBe("$70");
  });

  it("restores the shopper discount when an earlier winner becomes more expensive on reapplication", async () => {
    const { discounts, remove, clicks } = checkout({ BEST40: 40, SECOND20: 20 }, "remove");
    discounts.SHOPPER30 = 30;
    remove.hidden = false;
    remove.setAttribute("aria-label", "Remove SHOPPER30");
    document.querySelector<HTMLElement>(".success")!.hidden = false;
    document.querySelector("#cart-total")!.textContent = "$70";
    let uses = 0;
    document.querySelector('[data-test="apply-promo-code-button"]')!.addEventListener("click", () => {
      if (document.querySelector("input")!.value === "BEST40" && ++uses === 1) discounts.BEST40 = 10;
    });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(30000);
    expect(clicks.at(-1)).toBe("SHOPPER30");
    expect(document.querySelector("#cart-total")!.textContent).toBe("$70");
    expect(sendMessage.mock.calls.some(([m]) => m.isFinal && m.result === "applied")).toBe(false);
  });

  it("verifies the next cheapest coupon when the provisional winner becomes more expensive", async () => {
    const { discounts, clicks } = checkout({ BEST40: 40, SECOND35: 35 }, "remove");
    let uses = 0;
    document.querySelector('[data-test="apply-promo-code-button"]')!.addEventListener("click", () => {
      if (document.querySelector("input")!.value === "BEST40" && ++uses === 1) discounts.BEST40 = 10;
    });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(30000);
    expect(clicks.at(-1)).toBe("SECOND35");
    expect(document.querySelector("#cart-total")!.textContent).toBe("$65");
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ isFinal: true, result: "applied", code: "SECOND35", newTotal: 65, comparisonComplete: false }));
  });

  it("leaves an unidentified existing coupon untouched", async () => {
    const { clicks, remove } = checkout({ NEW: 20 }, "remove");
    remove.hidden = false;
    document.querySelector("#cart-total")!.textContent = "$70";
    loadContentScript();
    await jest.advanceTimersByTimeAsync(2000);
    expect(clicks).toEqual([]);
    expect(document.querySelector("#cart-total")!.textContent).toBe("$70");
  });

  it("does not claim a provisional discount while the request remains busy", async () => {
    checkout({ PROVISIONAL: 20 });
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", (event) => {
        (event.currentTarget as HTMLElement).setAttribute("aria-busy", "true");
      });
    loadContentScript();
    await jest.advanceTimersByTimeAsync(65000);
    expect(sendMessage.mock.calls.filter(([m]) => m.isFinal)).toEqual([
      [
        expect.objectContaining({
          result: "failed",
          failureReason: "unconfirmed",
        }),
      ],
    ]);
  });

  it("cancels further coupon actions after device deactivation", async () => {
    const { clicks } = checkout({ FIRST: 10, SECOND: 20 }, "remove");
    let listener: (changes: Record<string, unknown>, area: string) => void;
    (chrome as unknown as { storage: unknown }).storage = {
      local: { get: jest.fn().mockResolvedValue({ dormant: false }) },
      onChanged: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
        removeListener: jest.fn(),
      },
    };
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () =>
        listener({ dormant: { newValue: true } }, "local"),
      );
    loadContentScript();
    await jest.advanceTimersByTimeAsync(5000);
    expect(clicks).toEqual(["FIRST"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ isFinal: true, failureReason: "cancelled" }),
    );
    delete (chrome as unknown as { storage?: unknown }).storage;
  });

  it("stops after checkout navigation without restoring on the new route", async () => {
    const { clicks } = checkout({ FIRST: 10, SECOND: 20 }, "remove");
    const initial = location.href;
    document
      .querySelector('[data-test="apply-promo-code-button"]')!
      .addEventListener("click", () =>
        history.pushState({}, "", "/different-route"),
      );
    loadContentScript();
    await jest.advanceTimersByTimeAsync(5000);
    expect(clicks).toEqual(["FIRST"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        failureReason: "checkout_changed",
      }),
    );
    history.replaceState({}, "", initial);
  });

  it("stops at a confirmed saving when comparison is not configured", async () => {
    const { clicks } = checkout({ FIRST10: 10, LAST20: 20 });
    delete window.__SAVERLLY__!.recipe.couponApplyMode;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(3000);
    expect(clicks).toEqual(["FIRST10"]);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "applied",
        comparisonComplete: false,
        testedCount: 1,
      }),
    );
  });

  it("restores the shopper’s original code if none of the tested codes improve it", async () => {
    const { clicks } = checkout({ EXISTING30: 30, LAST10: 10 });
    document.querySelector("input")!.value = "EXISTING30";
    document.querySelector("#cart-total")!.textContent = "$70";
    document.querySelector<HTMLElement>(".success")!.hidden = false;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(20000);
    expect(clicks).toEqual(["EXISTING30", "LAST10", "EXISTING30"]);
    expect(document.querySelector("#cart-total")!.textContent).toBe("$70");
    expect(
      sendMessage.mock.calls.some(([m]) => m.isFinal && m.result === "applied"),
    ).toBe(false);
  });

  // Regression test for a live Allbirds checkout bug: a discount already applied at checkout
  // start (a marketing code, a returning-customer promo, or an earlier Saverlly run whose
  // checkout session persisted) renders as a removable chip, not text inside the coupon
  // <input> -- the field itself reads empty. The applier must still identify and clear it
  // (from the remove control's accessible name) and run its normal comparison against the
  // true pre-discount price, rather than refusing to run at all.
  it("clears a chip-applied existing discount identified only by the remove control's label, then overrides it with a better code", async () => {
    const { clicks } = checkout({ EXISTING30: 30, LAST10: 10 }, "remove");
    // No input value set -- unlike the field-based test above, the code only lives on the chip.
    document
      .querySelector("#remove")!
      .setAttribute("aria-label", "Remove EXISTING30");
    document.querySelector("#cart-total")!.textContent = "$70";
    document.querySelector<HTMLElement>(".success")!.hidden = false;
    document.querySelector<HTMLElement>("#remove")!.hidden = false;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(20000);
    expect(clicks[0]).toBe("REMOVE");
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isFinal: true,
        result: "applied",
        code: "EXISTING30",
        originalTotal: 100,
        newTotal: 70,
        discountAmount: 30,
        incrementalSavings: 0,
      }),
    );
  });

  it("falls back to overwriting the field when an existing discount has no configured remove control", async () => {
    const { clicks } = checkout({ LAST10: 10 });
    document.querySelector("#cart-total")!.textContent = "$90";
    document.querySelector<HTMLElement>(".success")!.hidden = false;
    loadContentScript();
    await jest.advanceTimersByTimeAsync(5000);
    expect(clicks).toEqual(["LAST10"]);
  });
});
