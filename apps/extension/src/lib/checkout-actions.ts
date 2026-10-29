import type { CheckoutRecipe } from "@saverlly/shared-types";
import { parseCartTotal } from "./cart-total";
import { element, elements, isVisible } from "./checkout-dom";
import type { CouponApplyResultMessage } from "./messages";

// The checkout steps every coupon run is made of: revealing the promo box, submitting a code
// and reading the store's answer, and removing a code again. Shared by the shopper's coupon run
// (content-scripts/coupon-applier.ts) and admin store setup, so a recipe is tested by exactly
// the code shoppers will run it with.

// Timings dominate how long a run takes: every code pays them, so a 20-code store multiplies
// each one by 20. Polling is cheap DOM reads, so it runs often; the settle windows are only as
// long as checkouts have been observed to keep re-rendering after a response.
export const POLL_MS = 100;
export const RESPONSE_MS = 15_000;
export const STABLE_MS = 500;
// A rejection message is itself the store's answer. Once it has shown (and the total has not
// moved) only a short debounce is needed, not the full total-stability window.
export const FAILURE_SETTLE_MS = 300;
// Upper bound on waiting for a controlled form to enable Apply after the code is typed.
export const BUTTON_READY_MS = 1_000;
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export const cents = (value: number) => Math.round(value * 100);
export class ComparisonError extends Error {
  constructor(
    readonly reason: NonNullable<CouponApplyResultMessage["failureReason"]>,
  ) {
    super(reason);
  }
}
export function readTotal(selector: string): number | null {
  let el = element(selector);
  if (!el) return null;
  // A discount can append a "TOTAL SAVINGS" row after the actual total (Shopify).
  // Within the configured table, prefer its explicitly labelled total, never the
  // subtotal or savings amount. Keep other merchant selectors unchanged.
  const table = el.closest('[role="table"], table');
  if (table) {
    const totalRows = Array.from(
      table.querySelectorAll('[role="row"], tr'),
    ).filter((row) =>
      /^(?:order\s+|grand\s+)?total\s*:?$/i.test(
        row.querySelector('[role="rowheader"], th')?.textContent?.trim() ?? "",
      ),
    );
    if (totalRows.length === 1) {
      const cell = totalRows[0].querySelector<HTMLElement>('[role="cell"], td');
      if (cell) el = cell;
    }
  }
  // Shopify renders an animated old amount alongside the accessible current amount.
  // Read a detached copy without aria-hidden duplicates; never edit merchant-owned DOM.
  const copy = el.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll('[aria-hidden="true"], [hidden]')
    .forEach((node) => node.remove());
  return copy.textContent ? parseCartTotal(copy.textContent) : null;
}
// Many checkouts (Allbirds/Shopify included) move an already-applied code into a removable
// chip once accepted, leaving the coupon <input> empty -- reading .value alone misses it.
// The chip's own remove control commonly exposes the code in its accessible name
// ("Remove COMEBACK10"), which is readable before we ever click it.
export function readAppliedCodeFromRemoveControl(
  removeCouponSelector?: string,
): string | null {
  const removeControl = element(removeCouponSelector);
  if (!removeControl) return null;
  const label =
    removeControl.getAttribute("aria-label") ?? removeControl.textContent ?? "";
  const match = /remove\s+(.+)/i.exec(label.trim());
  return match ? match[1].trim() : null;
}
export function setFieldValue(field: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

// Ignore unrelated ancestor re-renders: they are not a response to the submitted code.
export function observeIndicators(
  success?: string,
  failure?: string,
  applySelector?: string,
) {
  const selectors = [success, failure].filter(Boolean).join(",");
  const signature = (el: Element) =>
    `${el.textContent}|${el.getAttribute("aria-label")}|${el.getAttribute("title")}`;
  const stale = new Map(
    elements(selectors)
      .filter(isVisible)
      .map((el) => [el, signature(el)]),
  );
  const changed = new Set<Element>();
  let observedBusy = false;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      if (
        record.type === "attributes" &&
        target &&
        elements(applySelector).includes(target as HTMLElement)
      ) {
        // A cached response can finish between 250ms polls. Attribute mutation history
        // still proves that this submission entered processing and then completed.
        const name = record.attributeName;
        if (
          (name === "disabled" &&
            (record.oldValue !== null || target.hasAttribute("disabled"))) ||
          ((name === "aria-busy" || name === "aria-disabled") &&
            (record.oldValue === "true" ||
              target.getAttribute(name) === "true"))
        )
          observedBusy = true;
      }
      for (const el of elements(selectors)) {
        if (
          target === el ||
          (record.type !== "attributes" && target && el.contains(target))
        )
          changed.add(el);
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      "hidden",
      "style",
      "aria-hidden",
      "disabled",
      "aria-busy",
      "aria-disabled",
    ],
  });
  return {
    fresh: (el: Element) =>
      !stale.has(el as HTMLElement) ||
      stale.get(el as HTMLElement) !== signature(el) ||
      changed.has(el),
    disconnect: () => observer.disconnect(),
    wasBusy: () => observedBusy,
  };
}

/**
 * The checkout steps for one recipe. `checkActive` is the caller's guard (cancelled, route
 * changed, ...): it runs before every DOM write and on every poll, and throws to abort.
 * `currentCode` is the code this run last got accepted (null once removed); `pendingResponse`
 * records whether the last timed-out attempt was still visibly in flight.
 */
const isEnabled = (button: HTMLButtonElement | null): button is HTMLButtonElement =>
  !!button &&
  !button.disabled &&
  button.getAttribute("aria-disabled") !== "true";

/**
 * The apply button once it's usable, or null. Controlled checkouts enable/re-render their
 * button after the input event, so this waits only as long as that actually takes instead of a
 * fixed delay per code. Shared by the shopper run and store setup so both judge a store alike.
 */
export async function waitForApplyButton(
  selector: string,
  checkActive: () => void,
): Promise<HTMLButtonElement | null> {
  const deadline = Date.now() + BUTTON_READY_MS;
  for (;;) {
    await sleep(50);
    checkActive();
    const button = element<HTMLButtonElement>(selector);
    if (isEnabled(button)) return button;
    if (Date.now() >= deadline) return null;
  }
}

export class CheckoutActions {
  currentCode: string | null = null;
  pendingResponse = false;

  constructor(
    private readonly recipe: CheckoutRecipe,
    private readonly checkActive: () => void,
  ) {}

  async reveal(): Promise<void> {
    this.checkActive();
    const field = element<HTMLInputElement>(this.recipe.couponFieldSelector);
    const reveal = element(this.recipe.couponFieldRevealSelector);
    if (reveal && (!field || (!isVisible(field) && isVisible(reveal))))
      reveal.click();
    const deadline = Date.now() + RESPONSE_MS;
    while (Date.now() < deadline) {
      this.checkActive();
      const input = element<HTMLInputElement>(this.recipe.couponFieldSelector);
      const button = element<HTMLButtonElement>(this.recipe.applyButtonSelector);
      if (input && button && !input.disabled) return;
      if (!reveal) break;
      await sleep(POLL_MS);
    }
    throw new ComparisonError("checkout_changed");
  }

  async resetCart(baseline: number | null): Promise<void> {
    if (!this.currentCode) return;
    this.checkActive();
    const remove = element(this.recipe.removeCouponSelector);
    if (!remove) throw new ComparisonError("restore_failed");
    remove.click();
    const deadline = Date.now() + RESPONSE_MS;
    let stableSince = 0;
    while (Date.now() < deadline) {
      this.checkActive();
      const total = readTotal(this.recipe.cartTotalSelector);
      if (
        total !== null &&
        baseline !== null &&
        cents(total) === cents(baseline)
      ) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= STABLE_MS) {
          this.currentCode = null;
          return;
        }
      } else stableSince = 0;
      await sleep(POLL_MS);
    }
    throw new ComparisonError("restore_failed");
  }

  // Clears whatever discount is already active before Saverlly's own comparison starts.
  // Unlike resetCart (which restores to an already-known baseline between our own attempts),
  // there is no known target here -- just wait for the total to rise off its current,
  // still-discounted reading and settle.
  async clearAppliedDiscount(): Promise<void> {
    const remove = element(this.recipe.removeCouponSelector);
    if (!remove) return;
    this.checkActive();
    const discounted = readTotal(this.recipe.cartTotalSelector);
    remove.click();
    const deadline = Date.now() + RESPONSE_MS;
    let stableSince = 0;
    let previous = discounted;
    while (Date.now() < deadline) {
      this.checkActive();
      const total = readTotal(this.recipe.cartTotalSelector);
      if (total !== previous) {
        previous = total;
        stableSince = Date.now();
      }
      const risen =
        total !== null &&
        (discounted === null || cents(total) > cents(discounted));
      if (risen && Date.now() - stableSince >= STABLE_MS) {
        this.currentCode = null;
        return;
      }
      await sleep(POLL_MS);
    }
    throw new ComparisonError("restore_failed");
  }

  async attempt(code: string): Promise<{
    outcome: "success" | "failure" | "timeout";
    total: number | null;
  }> {
    await this.reveal();
    let field = element<HTMLInputElement>(this.recipe.couponFieldSelector)!;
    const before = readTotal(this.recipe.cartTotalSelector);
    // Retrying the same rejected value may be a no-op for controlled forms. Clear
    // it through the merchant's input handler, allowing its validation to reset.
    if (
      field.value.trim() &&
      elements(this.recipe.failureIndicatorSelector).some(isVisible)
    ) {
      setFieldValue(field, "");
      await sleep(POLL_MS);
      await this.reveal();
      field = element<HTMLInputElement>(this.recipe.couponFieldSelector)!;
    }
    setFieldValue(field, code);
    const button = await waitForApplyButton(
      this.recipe.applyButtonSelector,
      this.checkActive,
    );
    if (!button) throw new ComparisonError("checkout_changed");
    // Snapshot after editing so validation changes caused by typing cannot be
    // mistaken for the response to the submission we are about to make.
    const indicators = observeIndicators(
      this.recipe.successIndicatorSelector,
      this.recipe.failureIndicatorSelector,
      this.recipe.applyButtonSelector,
    );
    try {
      button.click();
      let deadline = Date.now() + RESPONSE_MS;
      const hardDeadline = Date.now() + 60_000;
      let previous = before;
      let stableSince = Date.now();
      let success = false;
      let failure = false;
      let failureSince = 0;
      let wasBusy = false;
      while (Date.now() < deadline) {
        this.checkActive();
        const liveButton = element<HTMLButtonElement>(
          this.recipe.applyButtonSelector,
        );
        const submittedValue = element<HTMLInputElement>(
          this.recipe.couponFieldSelector,
        )?.value.trim();
        success ||= elements(this.recipe.successIndicatorSelector).some(
          (el) => isVisible(el) && indicators.fresh(el),
        );
        const failureVisible = elements(this.recipe.failureIndicatorSelector).some(
          (el) => isVisible(el) && indicators.fresh(el),
        );
        if (failureVisible && !failure) failureSince = Date.now();
        failure ||= failureVisible;
        // Many stores keep Apply disabled after rejecting a code until the input changes.
        // That is an answered request, not one still in flight: treating it as busy kept every
        // rejected code waiting out the 60s hard deadline.
        const busy =
          !liveButton ||
          liveButton.getAttribute("aria-busy") === "true" ||
          (!failureVisible &&
            (liveButton.getAttribute("aria-disabled") === "true" ||
              (liveButton.disabled && submittedValue === code)));
        if (busy) deadline = Math.min(hardDeadline, Date.now() + RESPONSE_MS);
        wasBusy ||= busy || indicators.wasBusy();
        const total = readTotal(this.recipe.cartTotalSelector);
        if (total !== previous) {
          previous = total;
          stableSince = Date.now();
        }
        const stable = total !== null && Date.now() - stableSince >= STABLE_MS;
        const reduced =
          total !== null && before !== null && cents(total) < cents(before);
        // A settled reduction is useful when a store has no success banner. An unchanged
        // prior discount cannot count as success for the newly submitted code.
        if (!busy && stable && (success || (reduced && !failure))) {
          // A success response can leave Apply disabled because the store clears the input.
          if (total !== before || (!busy && Date.now() - stableSince >= 1500)) {
            this.currentCode = code;
            return { outcome: "success", total };
          }
        }
        // A reused rejection can confirm a completed request with an unchanged
        // total, but must not override a later price reduction or success marker.
        const rejected =
          failure ||
          (wasBusy &&
            elements(this.recipe.failureIndicatorSelector).some(isVisible));
        const settled = failure
          ? total !== null &&
            Date.now() - Math.max(failureSince, stableSince) >= FAILURE_SETTLE_MS
          : stable;
        if (!busy && rejected && !success && settled && !reduced)
          return { outcome: "failure", total };
        await sleep(POLL_MS);
      }
      const liveButton = element<HTMLButtonElement>(this.recipe.applyButtonSelector);
      this.pendingResponse =
        !liveButton ||
        liveButton.getAttribute("aria-busy") === "true" ||
        liveButton.getAttribute("aria-disabled") === "true" ||
        (liveButton.disabled &&
          element<HTMLInputElement>(
            this.recipe.couponFieldSelector,
          )?.value.trim() === code);
      return { outcome: "timeout", total: readTotal(this.recipe.cartTotalSelector) };
    } finally {
      indicators.disconnect();
    }
  }
}
