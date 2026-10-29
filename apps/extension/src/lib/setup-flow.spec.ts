/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.test/checkout"}
 */
import { initialProgress, parseProgress, runSetupFlow, SETUP_STEPS, type SetupProgress } from "./setup-flow";
import { SetupOverlay } from "./setup-overlay";
import { buildRecipe } from "./setup-test";
import type { StoreSetupSubmitResult } from "./messages";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[hidden]") ? null : document.body;
    },
  });
});

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const click = (target: Element) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

const CHECKOUT = `
  <a href="#" id="reveal">Have a promo code?</a>
  <form class="discount" id="promo-form" hidden>
    <label for="code">Discount code</label>
    <input id="code" name="discount" placeholder="Discount code">
    <button type="submit" name="apply_discount">Apply</button>
  </form>
  <div role="table"><div role="row"><span role="rowheader">Total</span><strong class="grand-total">$84.20</strong></div></div>
  <p class="note">Free shipping on orders over $50</p>
  <iframe id="payments"></iframe>`;

function start(progress: SetupProgress = initialProgress(), prepare?: () => void) {
  document.querySelectorAll("saverlly-store-setup").forEach((n) => n.remove());
  document.body.innerHTML = CHECKOUT;
  $("#reveal").addEventListener("click", (event) => {
    event.preventDefault();
    $("#promo-form").hidden = false;
  });
  prepare?.();
  const overlay = new SetupOverlay({ storeName: "Demo", domain: "shop.test", onStop: jest.fn() });
  overlay.mount();
  const controller = new AbortController();
  const saved: SetupProgress[] = [];
  const submit = jest.fn(async (): Promise<StoreSetupSubmitResult> => ({ ok: true }));
  const stopSetup = jest.fn(() => controller.abort());
  const done = runSetupFlow({
    overlay,
    storeName: "Demo",
    domain: "shop.test",
    progress,
    save: async (p) => {
      saved.push(JSON.parse(JSON.stringify(p)));
    },
    submit,
    stop: stopSetup,
    signal: controller.signal,
  });
  const panel = overlay.inspect();
  const text = (className: string) => panel.querySelector(`.${className}`)?.textContent;
  return {
    panel,
    saved,
    done,
    text,
    submit,
    stopSetup,
    stop: async () => {
      controller.abort();
      await done;
    },
    title: () => text("title"),
    press: async (id: string) => {
      const button = panel.querySelector(`[data-action="${id}"]`);
      if (!button) throw new Error(`no "${id}" button on "${text("title")}"`);
      click(button);
      await flush();
    },
    pick: async (target: Element) => {
      click(target);
      await flush();
    },
  };
}

beforeEach(() => history.replaceState(null, "", "/checkout"));

it("walks the whole checkout: page, promo link, promo box, apply button and total", async () => {
  const flow = start();
  await flush();
  expect(flow.title()).toBe("Set up Demo");
  await flow.press("start");

  // 1. The page.
  expect(flow.text("step")).toBe("Step 1 of 8");
  expect(flow.title()).toBe("Is this the checkout page?");
  expect(flow.text("result")).toBe("Pages whose address contains /checkout");
  await flow.press("next");

  // 2. The box is behind a link: the click reaches the store and opens it.
  expect(flow.title()).toBe("Can you see the promo code box?");
  await flow.press("link");
  expect(flow.title()).toBe("Click the link that opens the promo box");
  await flow.pick($("#reveal"));
  expect($("#promo-form").hidden).toBe(false);
  expect(flow.text("detail")).toBe("#reveal");
  await flow.press("next");

  // 3. Clicking the box's label still records the box.
  expect(flow.title()).toBe("Click the promo code box");
  await flow.pick($('label[for="code"]'));
  expect(flow.text("result")).toBe("Promo code box selected.");
  expect(flow.text("detail")).toBe("#code");
  await flow.press("next");

  // 4. The form's own button is offered.
  expect(flow.title()).toBe("Click the apply button");
  expect(flow.text("body")).toBe("Is the outlined item the apply button?");
  await flow.press("yes");
  expect(flow.text("detail")).toBe('button[name="apply_discount"]');
  await flow.press("next");

  // 5. The total must read as a price.
  expect(flow.title()).toBe("Click the order total");
  await flow.pick($(".grand-total"));
  expect(flow.text("result")).toBe("Order total selected: $84.20");
  await flow.press("next");

  expect(flow.title()).toBe("Learn the store's error message");
  expect(flow.saved.at(-1)).toEqual({
    version: 2,
    step: 6,
    pattern: "/checkout",
    reveal: "link",
    picks: {
      revealLink: { selector: "#reveal", strategy: "id", exact: true },
      promoField: { selector: "#code", strategy: "id", exact: true },
      applyButton: { selector: 'button[name="apply_discount"]', strategy: "attribute", exact: true },
      cartTotal: { selector: "strong.grand-total", strategy: "class", exact: true },
    },
  });
  await flow.stop();
});

it("asks for the checkout itself when the address is too general", async () => {
  history.replaceState(null, "", "/");
  const flow = start({ version: 2, step: 1, picks: {} });
  await flush();
  expect(flow.title()).toBe("Open the checkout page");
  expect(flow.panel.dataset.tone).toBe("error");
  history.replaceState(null, "", "/checkouts/c/8f2a9b1c4d5e6f70/information");
  await flow.press("retry");
  expect(flow.text("result")).toBe("Pages whose address contains /checkouts/c");
  await flow.press("next");
  expect(flow.saved.at(-1)).toMatchObject({ pattern: "/checkouts/c", step: 2 });
  await flow.stop();
});

it("skips the link when the box is visible, and forgets a link chosen earlier", async () => {
  const flow = start({
    version: 2,
    step: 2,
    reveal: "link",
    picks: { revealLink: { selector: "#reveal", strategy: "id", exact: true } },
  });
  await flush();
  expect(flow.text("result")).toBe("Currently: the box opens from a link.");
  await flow.press("visible");
  expect(flow.title()).toBe("Click the promo code box");
  expect(flow.saved.at(-1)).toMatchObject({ reveal: "visible", picks: {} });
  await flow.stop();
});

it("rejects the wrong kind of element at each step, saying why", async () => {
  const flow = start({ version: 2, step: 2, picks: {} });
  await flush();
  await flow.press("link");
  $("#promo-form").hidden = false;
  await flow.pick($("#code"));
  expect(flow.text("result")).toContain("That's the promo box itself");
  await flow.pick($(".note"));
  expect(flow.text("result")).toContain("doesn't look like something a shopper clicks");
  await flow.pick($("#reveal"));
  await flow.press("next");

  await flow.pick($(".note"));
  expect(flow.text("result")).toBe("That isn't a text box. Click the box where a shopper types the code.");
  await flow.pick($("#payments"));
  expect(flow.text("result")).toContain("inside a separate frame");
  await flow.pick($("#code"));
  await flow.press("next");

  await flow.press("no");
  await flow.pick($("#reveal"));
  expect(flow.text("result")).toBe("That's the link that opens the promo box. Click the button that applies the code.");
  await flow.pick($(".note"));
  expect(flow.text("result")).toContain("doesn't look like a button");
  await flow.pick($('button[name="apply_discount"]'));
  await flow.press("next");

  await flow.pick($('[role="rowheader"]'));
  expect(flow.text("result")).toBe("That doesn't look like a price. Click the order total amount itself.");
  await flow.stop();
});

it("re-opens a hidden promo box from the panel without counting it as a pick", async () => {
  const flow = start({
    version: 2,
    step: 3,
    reveal: "link",
    picks: { revealLink: { selector: "#reveal", strategy: "id", exact: true } },
  });
  await flush();
  expect($("#promo-form").hidden).toBe(true);
  await flow.press("open");
  expect($("#promo-form").hidden).toBe(false);
  expect(flow.title()).toBe("Click the promo code box");
  expect(flow.text("detail")).toBeUndefined();
  await flow.pick($("#code"));
  expect(flow.text("detail")).toBe("#code");
  await flow.stop();
});

it("goes back through the steps and resumes on a saved pick", async () => {
  const flow = start({
    version: 2,
    step: 4,
    pattern: "/checkout",
    reveal: "visible",
    picks: { promoField: { selector: "#code", strategy: "id", exact: true } },
  });
  await flush();
  expect(flow.title()).toBe("Click the apply button");
  await flow.press("back");
  expect(flow.text("detail")).toBe("#code");
  await flow.press("back");
  expect(flow.title()).toBe("Can you see the promo code box?");
  expect(flow.saved.at(-1)!.step).toBe(2);
  await flow.stop();
});

it("ends cleanly when stopped mid-pick, leaving the page usable", async () => {
  const flow = start({ version: 2, step: 3, picks: {} });
  await flush();
  await flow.stop();
  const storeSaw = jest.fn();
  document.addEventListener("click", storeSaw);
  click($(".note"));
  expect(storeSaw).toHaveBeenCalled();
});

describe("learning the store's error message", () => {
  const picks = {
    promoField: { selector: "#code", strategy: "id", exact: true },
    applyButton: { selector: 'button[name="apply_discount"]', strategy: "attribute", exact: true },
    cartTotal: { selector: "strong.grand-total", strategy: "class", exact: true },
  } as const;
  const atErrorStep = (extra: Partial<SetupProgress> = {}): SetupProgress => ({
    version: 2,
    step: 6,
    pattern: "/checkout",
    reveal: "visible",
    picks: { ...picks },
    ...extra,
  });
  /** The store's answer to Apply, after a short delay like a real request. */
  const answer = (respond: (code: string) => void) => {
    $("#promo-form").hidden = false;
    $('button[name="apply_discount"]').addEventListener("click", (event) => {
      event.preventDefault();
      const code = ($("#code") as HTMLInputElement).value;
      setTimeout(() => respond(code), 300);
    });
  };
  const showError = (code: string) => {
    const p = document.createElement("p");
    p.className = "promo-error";
    p.setAttribute("role", "alert");
    p.textContent = `"${code}" isn't a valid code`;
    $("#promo-form").append(p);
  };
  const wait = async (ms: number) => {
    await jest.advanceTimersByTimeAsync(ms);
    await flush();
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("tries a made-up code, offers the message that appeared, and clears the code once confirmed", async () => {
    const flow = start(atErrorStep());
    answer(showError);
    await flush();
    expect(flow.text("step")).toBe("Step 6 of 8");
    await flow.press("run");
    expect(flow.title()).toBe("Trying a test code…");
    const code = flow.saved.at(-1)!.pendingTest!.code;
    expect(code).toMatch(/^SAVERLLY-TEST-/);
    await wait(3_000);

    expect(flow.title()).toBe("Is this the store's error message?");
    expect(flow.text("result")).toBe(`""${code}" isn't a valid code"`);
    expect(flow.saved.at(-1)!.pendingTest).toBeUndefined();
    await flow.press("yes");
    expect(flow.title()).toBe("The store's error message");
    // The code is only in the message's text, never in the selector.
    expect(flow.text("detail")).toBe("p.promo-error");
    expect(($("#code") as HTMLInputElement).value).toBe(code);
    await flow.press("next");
    expect(($("#code") as HTMLInputElement).value).toBe("");
    expect(flow.saved.at(-1)!.picks.failureMessage).toEqual({ selector: "p.promo-error", strategy: "class", exact: true });
    expect(flow.title()).toBe("Try a code that works (optional)");
    await flow.stop();
  });

  it("lets the admin click the message when the guess is wrong, and test again later", async () => {
    const flow = start(atErrorStep());
    answer((code) => {
      showError(code);
      const note = document.createElement("div");
      note.className = "toast-error";
      note.textContent = "Unable to apply";
      note.id = "toast";
      document.body.append(note);
    });
    await flush();
    await flow.press("run");
    await wait(3_000);
    await flow.press("no");
    expect(flow.title()).toBe("Click the store's error message");
    await flow.pick($("#toast"));
    expect(flow.text("detail")).toBe("#toast");
    await flow.press("next");
    expect(flow.saved.at(-1)!.picks.failureMessage!.selector).toBe("#toast");
    expect(flow.title()).toBe("Try a code that works (optional)");
    await flow.press("back");
    expect(flow.title()).toBe("The store's error message");
    await flow.press("retry");
    expect(flow.title()).toBe("Learn the store's error message");
    expect(flow.saved.at(-1)!.picks.failureMessage).toBeUndefined();
    await flow.stop();
  });

  it("offers to skip, with a warning, when the store shows nothing", async () => {
    const flow = start(atErrorStep());
    answer(() => {});
    await flush();
    await flow.press("run");
    await wait(9_000);
    expect(flow.title()).toBe("Saverlly didn't spot a message");
    await flow.press("skip");
    expect(flow.title()).toBe("No error message");
    expect(flow.panel.dataset.tone).toBe("error");
    expect(flow.saved.at(-1)!.noFailureMessage).toBe(true);
    await flow.press("next");
    expect(flow.title()).toBe("Try a code that works (optional)");
    await flow.stop();
  });

  it("stops and explains when the store accepts the made-up code", async () => {
    const flow = start(atErrorStep());
    answer(() => ($(".grand-total").textContent = "$74.20"));
    await flush();
    await flow.press("run");
    await wait(9_000);
    expect(flow.title()).toBe("Learn the store's error message");
    expect(flow.panel.dataset.tone).toBe("error");
    expect(flow.text("result")).toContain("The store accepted a made-up code");
    await flow.stop();
  });

  it("picks up the store's answer after it reloads the page to show it, without submitting again", async () => {
    const applied = jest.fn();
    const flow = start(atErrorStep({ pendingTest: { code: "SAVERLLY-TEST-AB12", at: Date.now() } }), () => {
      $("#promo-form").hidden = false;
      $('button[name="apply_discount"]').addEventListener("click", applied);
      const notice = document.createElement("ul");
      notice.className = "woocommerce-error";
      notice.setAttribute("role", "alert");
      notice.innerHTML = '<li>Coupon "SAVERLLY-TEST-AB12" does not exist!</li>';
      $("#promo-form").before(notice);
    });
    await flush();
    expect(flow.title()).toBe("Is this the store's error message?");
    expect(flow.text("result")).toBe('"Coupon "SAVERLLY-TEST-AB12" does not exist!"');
    expect(flow.saved.at(-1)!.pendingTest).toBeUndefined();
    expect(applied).not.toHaveBeenCalled();
    await flow.press("yes");
    expect(flow.text("detail")).toBe("ul.woocommerce-error");
    await flow.stop();
  });

  it("ignores a test left over from long ago and asks before submitting a new one", async () => {
    const flow = start(atErrorStep({ pendingTest: { code: "SAVERLLY-TEST-AB12", at: Date.now() - 10 * 60_000 } }));
    await flush();
    expect(flow.title()).toBe("Learn the store's error message");
    await flow.stop();
  });
});

describe("trying a code that works", () => {
  const picks = {
    promoField: { selector: "#code", strategy: "id", exact: true },
    applyButton: { selector: 'button[name="apply_discount"]', strategy: "attribute", exact: true },
    cartTotal: { selector: "strong.grand-total", strategy: "class", exact: true },
    failureMessage: { selector: "p.promo-error", strategy: "class", exact: true },
  } as const;
  const atRealCodeStep = (extra: Partial<SetupProgress> = {}): SetupProgress => ({
    version: 2,
    step: 7,
    pattern: "/checkout",
    reveal: "visible",
    picks: { ...picks },
    ...extra,
  });
  const field = () => $("#code") as HTMLInputElement;
  /** SAVE10 takes $10 off and becomes a chip; its × puts the total back (unless `brokenRemove`). */
  const storeWithCodes = ({ brokenRemove = false } = {}) => () => {
    $("#promo-form").hidden = false;
    $('button[name="apply_discount"]').addEventListener("click", (event) => {
      event.preventDefault();
      const code = field().value;
      setTimeout(() => {
        if (code !== "SAVE10") return;
        field().value = "";
        $(".grand-total").textContent = "$74.20";
        const chip = document.createElement("span");
        chip.className = "tag";
        chip.innerHTML = '<span class="tag-code">SAVE10</span><button type="button" class="tag-remove" aria-label="Remove SAVE10">×</button>';
        $("#promo-form").append(chip);
        chip.querySelector("button")!.addEventListener("click", () =>
          setTimeout(() => {
            chip.remove();
            if (!brokenRemove) $(".grand-total").textContent = "$84.20";
          }, 300),
        );
      }, 300);
    });
  };
  const typeAndApply = (code: string) => {
    field().value = code;
    field().dispatchEvent(new Event("input", { bubbles: true }));
    $('button[name="apply_discount"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  const wait = async (ms: number) => {
    await jest.advanceTimersByTimeAsync(ms);
    await flush();
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("learns the applied-code tag and the remove control, then proves removal works", async () => {
    const flow = start(atRealCodeStep(), storeWithCodes());
    await flush();
    expect(flow.text("step")).toBe("Step 7 of 8");
    await flow.press("start");
    expect(flow.title()).toBe("Apply your code");
    typeAndApply("SAVE10");
    await wait(500);
    await flow.press("done");
    await wait(2_000);

    expect(flow.title()).toBe("Is this how the store shows the code was applied?");
    expect(flow.text("result")).toBe('"SAVE10"');
    await flow.press("yes");
    expect(flow.title()).toBe("Is this how a shopper removes the code?");
    await flow.press("yes");
    await wait(2_000);

    expect(flow.title()).toBe("Working code");
    const saved = flow.saved.at(-1)!;
    // The code itself never reaches a selector, though both elements carry it.
    expect(saved.picks.successMessage!.selector).toBe("span.tag-code");
    expect(saved.picks.removeControl!.selector).toBe("button.tag-remove");
    expect(saved).toMatchObject({ realCode: "done", applyMode: "remove", codeStillApplied: false });
    expect(saved.pendingReal).toBeUndefined();
    expect($(".grand-total").textContent).toBe("$84.20");
    expect(Array.from(flow.panel.querySelectorAll(".notes li")).map((li) => li.textContent)).toEqual([
      "Applied-code message: found.",
      "Removing a code: works. Saverlly can safely compare several codes.",
    ]);
    await flow.press("next");
    expect(flow.title()).toBe("Test and send");
    await flow.stop();
  });

  it("can be skipped, leaving codes uncompared", async () => {
    const flow = start(atRealCodeStep(), storeWithCodes());
    await flush();
    await flow.press("skip");
    expect(flow.title()).toBe("Working code");
    expect(flow.text("notes")).toContain("won't compare codes");
    expect(flow.saved.at(-1)).toMatchObject({ realCode: "skipped" });
    expect(flow.saved.at(-1)!.applyMode).toBeUndefined();
    await flow.stop();
  });

  it("says so when the code didn't lower the total", async () => {
    const flow = start(atRealCodeStep(), storeWithCodes());
    await flush();
    await flow.press("start");
    typeAndApply("NOTREAL");
    await wait(500);
    await flow.press("done");
    await wait(2_000);
    expect(flow.title()).toBe("Try a code that works (optional)");
    expect(flow.panel.dataset.tone).toBe("error");
    expect(flow.text("result")).toBe(
      "The order total didn't go down (it's still 84.20). Check the code works on this store and try again, or skip this step.",
    );
    await flow.stop();
  });

  it("never compares codes when removing one doesn't bring the total back", async () => {
    const flow = start(atRealCodeStep(), storeWithCodes({ brokenRemove: true }));
    await flush();
    await flow.press("start");
    typeAndApply("SAVE10");
    await wait(500);
    await flow.press("done");
    await wait(2_000);
    await flow.press("yes");
    await flow.press("yes");
    await wait(20_000);
    expect(flow.title()).toBe("Working code");
    const saved = flow.saved.at(-1)!;
    expect(saved.applyMode).toBeUndefined();
    expect(saved.codeStillApplied).toBe(true);
    expect(saved.picks.removeControl).toBeUndefined();
    expect(flow.text("notes")).toContain("Removing a code: not available");
    expect(flow.text("notes")).toContain("still applied in this cart");
    await flow.stop();
  });

  it("carries on after the store reloads the page on Apply", async () => {
    const flow = start(atRealCodeStep({ pendingReal: { before: 84.2, at: Date.now(), code: "SAVE10" } }), () => {
      $("#promo-form").hidden = false;
      $(".grand-total").textContent = "$74.20";
      const notice = document.createElement("div");
      notice.className = "woocommerce-message";
      notice.setAttribute("role", "alert");
      notice.textContent = "Coupon code applied successfully.";
      $("#promo-form").before(notice);
    });
    await flush();
    expect(flow.title()).toBe("Is this how the store shows the code was applied?");
    expect(flow.text("result")).toBe('"Coupon code applied successfully."');
    expect(flow.saved.at(-1)!.pendingReal).toBeUndefined();
    await flow.stop();
  });

  it("starts over from the summary on request", async () => {
    const flow = start(
      atRealCodeStep({
        realCode: "done",
        applyMode: "remove",
        picks: { ...picks, successMessage: { selector: "span.tag-code", strategy: "class", exact: true } },
      }),
    );
    await flush();
    await flow.press("redo");
    expect(flow.title()).toBe("Try a code that works (optional)");
    const saved = flow.saved.at(-1)!;
    expect(saved.realCode).toBeUndefined();
    expect(saved.applyMode).toBeUndefined();
    expect(saved.picks.successMessage).toBeUndefined();
    await flow.stop();
  });
});

describe("testing the recipe and sending it", () => {
  const picks = {
    promoField: { selector: "#code", strategy: "id", exact: true },
    applyButton: { selector: 'button[name="apply_discount"]', strategy: "attribute", exact: true },
    cartTotal: { selector: "strong.grand-total", strategy: "class", exact: true },
    failureMessage: { selector: "p.promo-error", strategy: "class", exact: true },
  } as const;
  const atFinalStep = (extra: Partial<SetupProgress> = {}): SetupProgress => ({
    version: 2,
    step: 8,
    pattern: "/checkout",
    reveal: "visible",
    realCode: "skipped",
    picks: { ...picks },
    ...extra,
  });
  /** Rejects every code with a message, like a real store answering a request. */
  const rejectingStore = () => {
    $("#promo-form").hidden = false;
    $('button[name="apply_discount"]').addEventListener("click", (event) => {
      event.preventDefault();
      setTimeout(() => {
        let p = document.querySelector<HTMLElement>("p.promo-error");
        if (!p) {
          p = document.createElement("p");
          p.className = "promo-error";
          $("#promo-form").append(p);
        }
        p.textContent = "That code isn't valid";
      }, 300);
    });
  };
  const notes = (flow: ReturnType<typeof start>) =>
    Array.from(flow.panel.querySelectorAll(".notes li")).map((li) => li.textContent);
  const wait = async (ms: number) => {
    await jest.advanceTimersByTimeAsync(ms);
    await flush();
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("runs the recipe the shopper way, then sends exactly that recipe and result", async () => {
    const flow = start(atFinalStep(), rejectingStore);
    await flush();
    expect(flow.text("step")).toBe("Step 8 of 8");
    expect(flow.title()).toBe("Test and send");
    await flow.press("run");
    await wait(5_000);

    expect(flow.title()).toBe("The recipe works");
    expect(notes(flow)).toEqual([
      "✓ Checkout page: Runs on pages whose address contains /checkout.",
      "✓ Promo code box: Found the promo code box.",
      "✓ Apply button: Found the apply button.",
      "✓ Order total: Read the order total: 84.20.",
      "✓ Message for a rejected code: The store rejected the test code, and Saverlly recognised its message.",
      "– Message for an accepted code: No working code was tried.",
      "– Trying one code after another: No working code was tried, so Saverlly will apply the first code that works.",
    ]);
    expect(($("#code") as HTMLInputElement).value).toBe("");
    expect(flow.saved.at(-1)!.pendingFinal).toBeUndefined();

    await flow.press("send");
    expect(flow.submit).toHaveBeenCalledTimes(1);
    const [{ recipe, testResult }] = flow.submit.mock.calls[0] as unknown as [{ recipe: object; testResult: { passed: boolean; cartTotal: number } }];
    expect(recipe).toEqual({
      couponFieldSelector: "#code",
      applyButtonSelector: 'button[name="apply_discount"]',
      cartTotalSelector: "strong.grand-total",
      checkoutUrlPatterns: ["/checkout"],
      failureIndicatorSelector: "p.promo-error",
    });
    expect(testResult).toMatchObject({ passed: true, cartTotal: 84.2 });
    expect(flow.title()).toBe("Sent to the dashboard");
    expect(flow.saved.at(-1)!.submitted).toBe(true);

    await flow.press("stop");
    expect(flow.stopSetup).toHaveBeenCalled();
    await flow.done;
  });

  it("reports what failed and still lets the admin send it", async () => {
    const flow = start(atFinalStep({ noFailureMessage: true, picks: { ...picks, failureMessage: undefined } }), rejectingStore);
    await flush();
    await flow.press("run");
    await wait(2_000);
    expect(flow.title()).toBe("Some checks didn't pass");
    expect(flow.panel.dataset.tone).toBe("error");
    expect(notes(flow)).toContain(
      "✗ Message for a rejected code: No error message chosen, so Saverlly can't tell when the store rejects a code.",
    );
    expect(flow.panel.querySelector('[data-action="send"]')!.textContent).toBe("Send anyway");
    await flow.press("send");
    expect(flow.submit.mock.calls[0]).toEqual([expect.objectContaining({ testResult: expect.objectContaining({ passed: false }) })]);
    await flow.stop();
  });

  it("fails the page check when run somewhere the pattern doesn't cover", async () => {
    history.replaceState(null, "", "/cart");
    const flow = start(atFinalStep(), rejectingStore);
    await flush();
    await flow.press("run");
    await wait(5_000);
    expect(notes(flow)[0]).toBe("✗ Checkout page: This page's address doesn't contain /checkout, so Saverlly wouldn't run here.");
    await flow.stop();
  });

  it("shows a sending error and retries, and closes when the session has ended", async () => {
    const flow = start(atFinalStep(), rejectingStore);
    flow.submit
      .mockResolvedValueOnce({ ok: false, ended: false, error: "Could not reach Saverlly. Check the connection and try again." })
      .mockResolvedValueOnce({ ok: false, ended: true, error: "This store setup session has ended." });
    await flush();
    await flow.press("run");
    await wait(5_000);
    await flow.press("send");
    expect(flow.text("result")).toBe("Could not reach Saverlly. Check the connection and try again.");
    expect(flow.title()).toBe("The recipe works");
    await flow.press("send");
    expect(flow.title()).toBe("This setup session has ended");
    await flow.press("stop");
    expect(flow.stopSetup).toHaveBeenCalled();
    await flow.done;
  });

  it("says plainly when the store reloads the page to apply a code", async () => {
    const applied = jest.fn();
    const flow = start(atFinalStep({ pendingFinal: { at: Date.now() } }), () => {
      $("#promo-form").hidden = false;
      $('button[name="apply_discount"]').addEventListener("click", applied);
    });
    await flush();
    expect(flow.title()).toBe("Some checks didn't pass");
    expect(notes(flow)).toContain(
      "✗ Message for a rejected code: The store reloaded the page to apply the code. Saverlly's coupon testing can't carry on across a reload, so this store can't be automated yet.",
    );
    expect(applied).not.toHaveBeenCalled();
    expect(flow.saved.at(-1)!.pendingFinal).toBeUndefined();
    await flow.stop();
  });
});

describe("the draft recipe", () => {
  const base = {
    version: 2 as const,
    step: 8,
    pattern: "/checkouts/c",
    picks: {
      promoField: { selector: "#code", strategy: "id" as const, exact: true },
      applyButton: { selector: "#apply", strategy: "id" as const, exact: true },
      cartTotal: { selector: "#total", strategy: "id" as const, exact: true },
    },
  };

  it("includes only what was chosen and proven", () => {
    expect(buildRecipe(base)).toEqual({
      couponFieldSelector: "#code",
      applyButtonSelector: "#apply",
      cartTotalSelector: "#total",
      checkoutUrlPatterns: ["/checkouts/c"],
    });
    const full = buildRecipe({
      ...base,
      reveal: "link",
      applyMode: "remove",
      picks: {
        ...base.picks,
        revealLink: { selector: "#reveal", strategy: "id", exact: true },
        failureMessage: { selector: ".err", strategy: "class", exact: true },
        successMessage: { selector: ".ok", strategy: "class", exact: true },
        removeControl: { selector: ".x", strategy: "class", exact: true },
      },
    });
    expect(full).toMatchObject({
      couponFieldRevealSelector: "#reveal",
      failureIndicatorSelector: ".err",
      successIndicatorSelector: ".ok",
      couponApplyMode: "remove",
      removeCouponSelector: ".x",
    });
  });

  it("never switches on comparison without a proven remove control, nor uses a stale link", () => {
    const recipe = buildRecipe({
      ...base,
      reveal: "visible",
      picks: { ...base.picks, revealLink: { selector: "#reveal", strategy: "id", exact: true }, removeControl: { selector: ".x", strategy: "class", exact: true } },
    });
    expect(recipe).not.toHaveProperty("couponApplyMode");
    expect(recipe).not.toHaveProperty("removeCouponSelector");
    expect(recipe).not.toHaveProperty("couponFieldRevealSelector");
  });

  it("is incomplete without the box, button, total and page", () => {
    expect(buildRecipe({ ...base, pattern: undefined })).toBeNull();
    expect(buildRecipe({ ...base, picks: { ...base.picks, cartTotal: undefined } })).toBeNull();
  });
});

describe("saved progress", () => {
  const pick = { selector: "#x", strategy: "id", exact: true };
  it("accepts what this version wrote", () => {
    const progress = { version: 2, step: 3, pattern: "/checkout", reveal: "link", picks: { revealLink: pick, promoField: pick } };
    expect(parseProgress(progress)).toEqual(progress);
  });

  it.each([
    null,
    "x",
    { version: 1, step: 1, picks: {} },
    { version: 2, step: SETUP_STEPS.length, picks: {} },
    { version: 2, step: -1, picks: {} },
    { version: 2, step: 0, picks: null },
    { version: 2, step: 0, pattern: 5, picks: {} },
    { version: 2, step: 0, reveal: "maybe", picks: {} },
    { version: 2, step: 0, picks: { somethingElse: pick } },
    { version: 2, step: 0, picks: { promoField: { selector: "#x" } } },
    { version: 2, step: 0, noFailureMessage: "yes", picks: {} },
    { version: 2, step: 0, pendingTest: { code: 5, at: 1 }, picks: {} },
    { version: 2, step: 0, realCode: "maybe", picks: {} },
    { version: 2, step: 0, applyMode: "replace", picks: {} },
    { version: 2, step: 0, pendingReal: { before: "84", at: 1 }, picks: {} },
    { version: 2, step: 0, pendingFinal: { at: "now" }, picks: {} },
    { version: 2, step: 0, submitted: "yes", picks: {} },
  ])("starts over from %p", (value) => expect(parseProgress(value)).toEqual(initialProgress()));
});

describe("starting from the store platform's template", () => {
  const SHOPIFY = `
    <script src="https://cdn.shopify.com/s/checkout.js"></script>
    <form id="discount"><input name="reductions" placeholder="Discount code"><button type="submit">Apply</button></form>
    <span class="payment-due__price">$84.20</span>`;
  const onShopify = (html = SHOPIFY) => () => {
    history.replaceState(null, "", "/checkouts/cn/abc123/information");
    document.body.innerHTML = html;
  };

  it("fills in a Shopify checkout and goes straight to learning the error message", async () => {
    const flow = start(initialProgress(), onShopify());
    await flush();
    expect(flow.text("body")).toMatch(/^This store runs on Shopify, so Saverlly will fill in/);
    await flow.press("start");
    await flush();
    expect(flow.title()).toBe("Found Shopify's checkout");
    expect(Array.from(flow.panel.querySelectorAll(".notes li"), (li) => li.textContent)).toEqual([
      "✓ Checkout page: pages whose address contains /checkouts/",
      "✓ Promo code box: found",
      "✓ Apply button: found",
      "✓ Order total: found",
    ]);
    await flow.press("next");
    expect(flow.title()).toBe("Learn the store's error message");
    const saved = flow.saved.at(-1)!;
    expect(saved).toMatchObject({ step: 6, platform: "SHOPIFY", pattern: "/checkouts/", reveal: "visible" });
    expect(Object.keys(saved.picks).sort()).toEqual(["applyButton", "cartTotal", "promoField"]);

    // Back reaches the filled-in parts, to check or change them.
    await flow.press("back");
    expect(flow.title()).toBe("Click the order total");
    expect(flow.text("detail")).toBe(".payment-due__price");
    await flow.stop();
  });

  it("asks only for the part it couldn't recognise", async () => {
    const flow = start(
      initialProgress(),
      onShopify(SHOPIFY.replace('<span class="payment-due__price">$84.20</span>', '<b class="x-total">$84.20</b>')),
    );
    await flush();
    await flow.press("start");
    await flush();
    expect(flow.title()).toBe("Found part of Shopify's checkout");
    expect(flow.panel.querySelectorAll(".notes li")[3].textContent).toBe("– Order total: you'll point to it");
    await flow.press("next");
    expect(flow.title()).toBe("Click the order total");
    await flow.pick($(".x-total"));
    expect(flow.text("result")).toBe("Order total selected: $84.20");
    await flow.press("next");
    expect(flow.title()).toBe("Learn the store's error message");
    await flow.stop();
  });

  it("can be set aside to set the store up by clicking", async () => {
    const flow = start(initialProgress(), onShopify());
    await flush();
    await flow.press("start");
    await flush();
    await flow.press("manual");
    expect(flow.title()).toBe("Is this the checkout page?");
    expect(flow.saved.at(-1)).toMatchObject({ picks: {}, step: 1 });
    expect(flow.saved.at(-1)!.platform).toBeUndefined();
    await flow.stop();
  });

  it("names a recognised platform that has no template, and sets it up by clicking", async () => {
    const flow = start(initialProgress(), () => {
      document.body.innerHTML = `<img src="https://static.wixstatic.com/media/a.jpg">${CHECKOUT}`;
    });
    await flush();
    expect(flow.text("result")).toBe("This store runs on Wix.");
    await flow.press("start");
    expect(flow.title()).toBe("Is this the checkout page?");
    await flow.stop();
  });

  it("keeps the admin's own picks when they come back to the start", async () => {
    const progress = { ...initialProgress(), pattern: "/checkout", picks: { promoField: { selector: "#mine", strategy: "id" as const, exact: true } } };
    const flow = start(progress, onShopify());
    await flush();
    expect(flow.text("body")).toMatch(/^Saverlly will walk you through this checkout/);
    await flow.press("start");
    expect(flow.title()).toBe("Is this the checkout page?");
    expect(flow.saved.at(-1)!.picks.promoField!.selector).toBe("#mine");
    await flow.stop();
  });

  it("refuses saved progress naming an unknown platform", () => {
    expect(parseProgress({ ...initialProgress(), platform: "SHOPIFY" }).platform).toBe("SHOPIFY");
    expect(parseProgress({ ...initialProgress(), step: 3, platform: "MYSPACE" })).toEqual(initialProgress());
  });
});
