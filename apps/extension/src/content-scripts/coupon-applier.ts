import { couponsInTestOrder } from "../lib/cart-total";
import {
  CheckoutActions,
  ComparisonError,
  cents,
  readAppliedCodeFromRemoveControl,
  readTotal,
} from "../lib/checkout-actions";
import { element, elements, isVisible } from "../lib/checkout-dom";
import type {
  CouponApplyProgressMessage,
  CouponApplyResultMessage,
} from "../lib/messages";

(async function main() {
  const context = window.__SAVERLLY__;
  if (!context || window.__SAVERLLY_APPLYING__) return;
  window.__SAVERLLY_APPLYING__ = true;
  const { merchantId, recipe, runId } = context;
  const ordered = couponsInTestOrder(context.coupons ?? []);
  const testedCodes: Array<{ code: string; saved: boolean }> = [];
  let baseline: number | null = null;
  let startingTotal: number | null = null;
  let originalCode: string | null = null;
  let originalTotal: number | null = null;
  let originalRemoved = false;
  let best: { coupon: (typeof ordered)[number]; total: number } | null = null;
  const successfulQuotes: Array<{ coupon: (typeof ordered)[number]; total: number }> = [];
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
  const actions = new CheckoutActions(recipe, checkActive);
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

  async function restoreOriginal(): Promise<void> {
    if (!originalCode || originalTotal === null) return;
    if (recipe.couponApplyMode === "remove") await actions.resetCart(baseline);
    const restored = await actions.attempt(originalCode);
    if (
      restored.outcome !== "success" ||
      restored.total === null ||
      cents(restored.total) > cents(originalTotal)
    )
      throw new ComparisonError("restore_failed");
    originalRemoved = false;
  }

  async function selectBest(): Promise<void> {
    if (!best || baseline === null) return;
    const selections = new Set<string>();
    for (;;) {
    if (selections.has(best.coupon.id)) throw new ComparisonError("unconfirmed");
    selections.add(best.coupon.id);
    const observed = readTotal(recipe.cartTotalSelector);
    if (
      actions.currentCode !== best.coupon.code ||
      observed === null ||
      cents(observed) !== cents(best.total)
    ) {
      if (recipe.couponApplyMode === "remove") await actions.resetCart(baseline);
      const reapplied = await actions.attempt(best.coupon.code);
      if (
        reapplied.outcome !== "success" ||
        reapplied.total === null ||
        cents(reapplied.total) >= cents(baseline)
      )
        throw new ComparisonError("restore_failed");
      // Taxes/shipping can settle differently on reapplication. Report the confirmed
      // final delta instead of declaring a working code a failure over a stale total.
      if (cents(best.total) !== cents(reapplied.total)) comparisonComplete = false;
      best.total = reapplied.total;
    }
    const cheaper = successfulQuotes.filter(quote => quote.coupon.id !== best!.coupon.id && cents(quote.total) < cents(best!.total))
      .sort((a, b) => a.total - b.total)[0];
    if (!cheaper) break;
    // Prices changed since testing: verify the next candidate instead of accepting an
    // earlier, now more expensive quote. Bound attempts if the checkout keeps changing.
    best = cheaper;
    }
    // Reapplication is a new price quote. A provisional winner must never cost more
    // than the shopper's original discount after taxes/shipping or eligibility change.
    if (originalCode && originalTotal !== null && cents(best.total) > cents(originalTotal)) {
      await restoreOriginal();
      finish("failed", { failureReason: "restore_failed" });
      return;
    }
    finish("applied", {
      couponId: best.coupon.id,
      code: best.coupon.code,
      originalTotal: baseline,
      newTotal: best.total,
      discountAmount: (cents(baseline) - cents(best.total)) / 100,
      incrementalSavings:
        Math.max(0, cents(startingTotal ?? baseline) - cents(best.total)) / 100,
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
    await actions.reveal();
    startingTotal = readTotal(recipe.cartTotalSelector);
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
      originalTotal = readTotal(recipe.cartTotalSelector);
      originalCode =
        readAppliedCodeFromRemoveControl(recipe.removeCouponSelector) ||
        element<HTMLInputElement>(recipe.couponFieldSelector)?.value.trim() ||
        null;
      const activeRemoveControls = elements(recipe.removeCouponSelector).filter(
        isVisible,
      );
      // Never erase an unknown code or a stack of shopper discounts that we cannot restore.
      if (
        activeRemoveControls.length &&
        (!originalCode ||
          activeRemoveControls.length > 1 ||
          originalTotal === null)
      )
        throw new ComparisonError("unconfirmed");
      actions.currentCode = originalCode;
      originalRemoved = activeRemoveControls.length > 0;
      await actions.clearAppliedDiscount();
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
      if (recipe.couponApplyMode === "remove") await actions.resetCart(baseline);
      send({
        type: "COUPON_APPLY_PROGRESS",
        phase: "testing",
        code: coupon.code,
        index: index + 1,
        total: ordered.length,
        testedCodes: [...testedCodes],
      });
      const trial = await actions.attempt(coupon.code);
      if (trial.outcome === "timeout") {
        comparisonComplete = false;
        if (actions.pendingResponse) throw new ComparisonError("unconfirmed");
        if (best) break;
        throw new ComparisonError("unconfirmed");
      }
      const saved =
        trial.outcome === "success" &&
        trial.total !== null &&
        cents(trial.total) < cents(baseline);
      testedCodes.push({ code: coupon.code, saved });
      if (saved && trial.total !== null) {
        const quote = { coupon, total: trial.total };
        successfulQuotes.push(quote);
        if (!best || cents(trial.total) < cents(best.total)) best = quote;
      }
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
    if (
      originalRemoved &&
      originalTotal !== null &&
      (!best || cents(best.total) > cents(originalTotal))
    ) {
      await restoreOriginal();
      finish("failed");
      return;
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
    if (originalCode && actions.currentCode !== originalCode) {
      await restoreOriginal();
    } else if (actions.currentCode && recipe.removeCouponSelector) await actions.resetCart(baseline);
    const finalTotal = readTotal(recipe.cartTotalSelector);
    if (finalTotal === null || cents(finalTotal) > cents(baseline))
      throw new ComparisonError("restore_failed");
    finish("failed");
  } catch (error) {
    // Deactivation cancels further DOM writes; it must not start a restoration request.
    if (
      !cancelled &&
      !actions.pendingResponse &&
      location.pathname + location.hash === initialPath &&
      originalCode &&
      (originalRemoved || (actions.currentCode && actions.currentCode !== originalCode))
    ) {
      try {
        await restoreOriginal();
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
