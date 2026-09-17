import {
  parseCartTotal,
  sortCouponsBySuccessLikelihood,
} from "../lib/cart-total";
import { element, elements, isVisible } from "../lib/checkout-dom";
import type {
  CouponApplyProgressMessage,
  CouponApplyResultMessage,
} from "../lib/messages";

const POLL_MS = 250;
const RESPONSE_MS = 15_000;
const STABLE_MS = 750;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const cents = (value: number) => Math.round(value * 100);
class ComparisonError extends Error {
  constructor(
    readonly reason: NonNullable<CouponApplyResultMessage["failureReason"]>,
  ) {
    super(reason);
  }
}
function readTotal(selector: string): number | null {
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
function readAppliedCodeFromRemoveControl(
  removeCouponSelector?: string,
): string | null {
  const removeControl = element(removeCouponSelector);
  if (!removeControl) return null;
  const label =
    removeControl.getAttribute("aria-label") ?? removeControl.textContent ?? "";
  const match = /remove\s+(.+)/i.exec(label.trim());
  return match ? match[1].trim() : null;
}
function setFieldValue(field: HTMLInputElement, value: string): void {
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
function observeIndicators(success?: string, failure?: string) {
  const selectors = [success, failure].filter(Boolean).join(",");
  const signature = (el: Element) =>
    `${el.textContent}|${el.getAttribute("aria-label")}|${el.getAttribute("title")}`;
  const stale = new Map(
    elements(selectors)
      .filter(isVisible)
      .map((el) => [el, signature(el)]),
  );
  const changed = new Set<Element>();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
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
    attributeFilter: ["hidden", "style", "aria-hidden"],
  });
  return {
    fresh: (el: Element) =>
      !stale.has(el as HTMLElement) ||
      stale.get(el as HTMLElement) !== signature(el) ||
      changed.has(el),
    disconnect: () => observer.disconnect(),
  };
}

(async function main() {
  const context = window.__SAVERLLY__;
  if (!context || window.__SAVERLLY_APPLYING__) return;
  window.__SAVERLLY_APPLYING__ = true;
  const { merchantId, recipe, runId } = context;
  const ordered = sortCouponsBySuccessLikelihood(context.coupons ?? []).filter(
    (coupon, index, all) =>
      all.findIndex(
        (other) => other.code.toLowerCase() === coupon.code.toLowerCase(),
      ) === index,
  );
  const testedCodes: Array<{ code: string; saved: boolean }> = [];
  let baseline: number | null = null;
  let currentCode: string | null = null;
  let originalCode: string | null = null;
  let best: { coupon: (typeof ordered)[number]; total: number } | null = null;
  let cancelled = false;
  let comparisonComplete = true;
  const initialPath = location.pathname + location.hash;
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes.dormant?.newValue === true)
      cancelled = true;
  };
  chrome.storage?.onChanged?.addListener(onStorage);
  function checkActive(): void {
    if (cancelled) throw new ComparisonError("cancelled");
    if (location.pathname + location.hash !== initialPath)
      throw new ComparisonError("checkout_changed");
  }
  const send = (
    message: CouponApplyResultMessage | CouponApplyProgressMessage,
  ) => {
    void Promise.resolve(
      chrome.runtime.sendMessage({ ...message, runId }),
    ).catch(() => {});
  };
  const finish = (
    result: CouponApplyResultMessage["result"],
    extra: Partial<CouponApplyResultMessage> = {},
  ) =>
    send({
      type: "COUPON_APPLY_RESULT",
      merchantId,
      couponId: null,
      code: null,
      result,
      isFinal: true,
      testedCount: testedCodes.length,
      comparisonComplete,
      ...extra,
    });

  async function reveal(): Promise<void> {
    checkActive();
    const field = element<HTMLInputElement>(recipe.couponFieldSelector);
    const reveal = element(recipe.couponFieldRevealSelector);
    if (reveal && (!field || (!isVisible(field) && isVisible(reveal))))
      reveal.click();
    const deadline = Date.now() + RESPONSE_MS;
    while (Date.now() < deadline) {
      checkActive();
      const input = element<HTMLInputElement>(recipe.couponFieldSelector);
      const button = element<HTMLButtonElement>(recipe.applyButtonSelector);
      if (input && button && !input.disabled) return;
      if (!reveal) break;
      await sleep(POLL_MS);
    }
    throw new ComparisonError("checkout_changed");
  }

  async function resetCart(): Promise<void> {
    if (!currentCode) return;
    checkActive();
    const remove = element(recipe.removeCouponSelector);
    if (!remove) throw new ComparisonError("restore_failed");
    remove.click();
    const deadline = Date.now() + RESPONSE_MS;
    let stableSince = 0;
    while (Date.now() < deadline) {
      checkActive();
      const total = readTotal(recipe.cartTotalSelector);
      if (
        total !== null &&
        baseline !== null &&
        cents(total) === cents(baseline)
      ) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= STABLE_MS) {
          currentCode = null;
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
  async function clearAppliedDiscount(): Promise<void> {
    const remove = element(recipe.removeCouponSelector);
    if (!remove) return;
    checkActive();
    const discounted = readTotal(recipe.cartTotalSelector);
    remove.click();
    const deadline = Date.now() + RESPONSE_MS;
    let stableSince = 0;
    let previous = discounted;
    while (Date.now() < deadline) {
      checkActive();
      const total = readTotal(recipe.cartTotalSelector);
      if (total !== previous) {
        previous = total;
        stableSince = Date.now();
      }
      const risen =
        total !== null &&
        (discounted === null || cents(total) > cents(discounted));
      if (risen && Date.now() - stableSince >= STABLE_MS) {
        currentCode = null;
        return;
      }
      await sleep(POLL_MS);
    }
    throw new ComparisonError("restore_failed");
  }

  async function attempt(code: string): Promise<{
    outcome: "success" | "failure" | "timeout";
    total: number | null;
  }> {
    await reveal();
    const field = element<HTMLInputElement>(recipe.couponFieldSelector)!;
    const before = readTotal(recipe.cartTotalSelector);
    const indicators = observeIndicators(
      recipe.successIndicatorSelector,
      recipe.failureIndicatorSelector,
    );
    try {
      setFieldValue(field, code);
      // Controlled checkouts enable/re-render their button after the input event.
      await sleep(POLL_MS);
      checkActive();
      const button = element<HTMLButtonElement>(recipe.applyButtonSelector);
      if (
        !button ||
        button.disabled ||
        button.getAttribute("aria-disabled") === "true"
      )
        throw new ComparisonError("checkout_changed");
      button.click();
      let deadline = Date.now() + RESPONSE_MS;
      const hardDeadline = Date.now() + 60_000;
      let previous = before;
      let stableSince = Date.now();
      let success = false;
      let failure = false;
      let wasBusy = false;
      while (Date.now() < deadline) {
        checkActive();
        const liveButton = element<HTMLButtonElement>(
          recipe.applyButtonSelector,
        );
        const submittedValue = element<HTMLInputElement>(
          recipe.couponFieldSelector,
        )?.value.trim();
        const busy =
          !liveButton ||
          liveButton.getAttribute("aria-busy") === "true" ||
          (liveButton.disabled && submittedValue === code);
        if (busy) deadline = Math.min(hardDeadline, Date.now() + RESPONSE_MS);
        wasBusy ||= busy;
        success ||= elements(recipe.successIndicatorSelector).some(
          (el) => isVisible(el) && indicators.fresh(el),
        );
        failure ||= elements(recipe.failureIndicatorSelector).some(
          (el) => isVisible(el) && indicators.fresh(el),
        );
        if (wasBusy && !busy && !success)
          failure ||= elements(recipe.failureIndicatorSelector).some(isVisible);
        const total = readTotal(recipe.cartTotalSelector);
        if (total !== previous) {
          previous = total;
          stableSince = Date.now();
        }
        const stable = total !== null && Date.now() - stableSince >= STABLE_MS;
        const reduced =
          total !== null && before !== null && cents(total) < cents(before);
        // A settled reduction is useful when a store has no success banner. An unchanged
        // prior discount cannot count as success for the newly submitted code.
        if (stable && (success || (reduced && !failure))) {
          // A success response can leave Apply disabled because the store clears the input.
          if (total !== before || (!busy && Date.now() - stableSince >= 1500)) {
            currentCode = code;
            return { outcome: "success", total };
          }
        }
        if (!busy && failure && !success && stable && !reduced)
          return { outcome: "failure", total };
        await sleep(POLL_MS);
      }
      return { outcome: "timeout", total: readTotal(recipe.cartTotalSelector) };
    } finally {
      indicators.disconnect();
    }
  }

  async function selectBest(): Promise<void> {
    if (!best || baseline === null) return;
    const observed = readTotal(recipe.cartTotalSelector);
    if (
      currentCode !== best.coupon.code ||
      observed === null ||
      cents(observed) !== cents(best.total)
    ) {
      if (recipe.couponApplyMode === "remove") await resetCart();
      const reapplied = await attempt(best.coupon.code);
      if (
        reapplied.outcome !== "success" ||
        reapplied.total === null ||
        cents(reapplied.total) >= cents(baseline)
      )
        throw new ComparisonError("restore_failed");
      // Taxes/shipping can settle differently on reapplication. Report the confirmed
      // final delta instead of declaring a working code a failure over a stale total.
      best.total = reapplied.total;
    }
    finish("applied", {
      couponId: best.coupon.id,
      code: best.coupon.code,
      originalTotal: baseline,
      newTotal: best.total,
      discountAmount: (cents(baseline) - cents(best.total)) / 100,
    });
  }

  try {
    if ((await chrome.storage?.local?.get("dormant"))?.dormant === true)
      cancelled = true;
    checkActive();
    if (!ordered.length) {
      finish("no_coupons_available");
      return;
    }
    await reveal();
    // A shopper may already have a discount active -- a marketing code, a returning-customer
    // promo, or an earlier Saverlly run whose checkout session persisted. Our own comparison
    // should override it rather than refuse to run: identify it best-effort (so the end-of-run
    // safety net below can restore it if none of our own codes beat it), clear it if it's a
    // removable chip the input field can't just overwrite, then measure the true pre-discount
    // baseline every one of our own codes competes against.
    if (
      elements(recipe.successIndicatorSelector).some(isVisible) ||
      elements(recipe.removeCouponSelector).some(isVisible)
    ) {
      originalCode =
        element<HTMLInputElement>(recipe.couponFieldSelector)?.value.trim() ||
        readAppliedCodeFromRemoveControl(recipe.removeCouponSelector) ||
        null;
      await clearAppliedDiscount();
    }
    baseline = readTotal(recipe.cartTotalSelector);
    if (baseline === null) throw new ComparisonError("unconfirmed");
    // Legacy recipes can safely try failures then stop at the first confirmed saving.
    // Never assume replacement/stacking behavior merely because a mode is missing.
    const canCompare =
      recipe.couponApplyMode === "replace" ||
      (recipe.couponApplyMode === "remove" && !!recipe.removeCouponSelector);
    for (const [index, coupon] of ordered.entries()) {
      checkActive();
      if (recipe.couponApplyMode === "remove") await resetCart();
      send({
        type: "COUPON_APPLY_PROGRESS",
        phase: "testing",
        code: coupon.code,
        index: index + 1,
        total: ordered.length,
        testedCodes: [...testedCodes],
      });
      const trial = await attempt(coupon.code);
      if (trial.outcome === "timeout") {
        comparisonComplete = false;
        if (best) break;
        throw new ComparisonError("unconfirmed");
      }
      const saved =
        trial.outcome === "success" &&
        trial.total !== null &&
        cents(trial.total) < cents(baseline);
      testedCodes.push({ code: coupon.code, saved });
      if (
        saved &&
        trial.total !== null &&
        (!best || cents(trial.total) < cents(best.total))
      )
        best = { coupon, total: trial.total };
      send({
        type: "COUPON_APPLY_RESULT",
        merchantId,
        couponId: coupon.id,
        code: coupon.code,
        result: saved ? "applied" : "failed",
        isFinal: false,
      });
      if (trial.outcome === "success" && !canCompare) {
        comparisonComplete = index === ordered.length - 1;
        break;
      }
    }
    if (best) {
      send({
        type: "COUPON_APPLY_PROGRESS",
        phase: "applying",
        code: best.coupon.code,
        index: testedCodes.length,
        total: ordered.length,
        testedCodes: [...testedCodes],
      });
      await selectBest();
      return;
    }
    if (originalCode && currentCode !== originalCode) {
      const restored = await attempt(originalCode);
      if (
        restored.outcome !== "success" ||
        restored.total === null ||
        cents(restored.total) !== cents(baseline)
      )
        throw new ComparisonError("restore_failed");
    } else if (currentCode && recipe.removeCouponSelector) await resetCart();
    const finalTotal = readTotal(recipe.cartTotalSelector);
    if (finalTotal === null || cents(finalTotal) > cents(baseline))
      throw new ComparisonError("restore_failed");
    finish("failed");
  } catch (error) {
    // Deactivation cancels further DOM writes; it must not start a restoration request.
    if (!cancelled && originalCode && currentCode && baseline !== null) {
      try {
        const restored = await attempt(originalCode);
        if (
          restored.outcome !== "success" ||
          restored.total === null ||
          cents(restored.total) !== cents(baseline)
        )
          throw new Error();
      } catch {
        error = new ComparisonError("restore_failed");
      }
    }
    // Keep a confirmed discount when a later comparison fails. Do not remove the useful
    // result simply to return the cart to its undiscounted starting point.
    finish("failed", {
      failureReason:
        error instanceof ComparisonError ? error.reason : "unconfirmed",
    });
  } finally {
    window.__SAVERLLY_APPLYING__ = false;
    chrome.storage?.onChanged?.removeListener(onStorage);
  }
})();
