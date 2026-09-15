import {
  parseCartTotal,
  sortCouponsBySuccessLikelihood,
} from "../lib/cart-total";
import type {
  CouponApplyProgressMessage,
  CouponApplyResultMessage,
} from "../lib/messages";

const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 4000;
const REVEAL_TIMEOUT_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Some checkouts (e.g. Target) hide the coupon field behind a click-to-reveal button. If the
// field isn't already present, click the trigger once and wait for it to render before the
// apply loop starts looking for couponFieldSelector/applyButtonSelector.
async function revealCouponField(
  couponFieldSelector: string,
  revealSelector?: string,
): Promise<void> {
  if (!revealSelector || document.querySelector(couponFieldSelector)) return;
  const trigger = document.querySelector<HTMLElement>(revealSelector);
  if (!trigger) return;
  trigger.click();
  const deadline = Date.now() + REVEAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (document.querySelector(couponFieldSelector)) return;
    await sleep(POLL_INTERVAL_MS);
  }
}

function readTotal(selector: string): number | null {
  const el = document.querySelector(selector);
  if (!el?.textContent) return null;
  return parseCartTotal(el.textContent);
}

// Merchant checkout pages commonly pre-render both indicators hidden (display:none) and
// only reveal one after the apply request resolves. Matching on DOM presence alone would
// report success/failure immediately regardless of which one the page actually surfaces.
function isVisible(el: Element): boolean {
  return (
    getComputedStyle(el).visibility !== "hidden" &&
    ((el as HTMLElement).offsetParent !== null ||
      el.getClientRects().length > 0)
  );
}

async function waitForIndicator(
  successSelector: string,
  failureSelector: string,
  isFresh: (el: Element) => boolean,
): Promise<"success" | "failure" | "timeout"> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (
      Array.from(document.querySelectorAll(successSelector)).some(
        (el) => isVisible(el) && isFresh(el),
      )
    )
      return "success";
    if (
      Array.from(document.querySelectorAll(failureSelector)).some(
        (el) => isVisible(el) && isFresh(el),
      )
    )
      return "failure";
    await sleep(POLL_INTERVAL_MS);
  }
  return "timeout";
}

function setFieldValue(field: HTMLInputElement, value: string): void {
  // Bypass React's instance value tracker so the input event reaches controlled state.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

// Observe fresh responses without deleting DOM owned by the checkout framework.
function observeIndicators(successSelector: string, failureSelector: string) {
  const selector = `${successSelector}, ${failureSelector}`;
  const stale = new Set(
    Array.from(document.querySelectorAll(selector)).filter(isVisible),
  );
  const changed = new Set<Element>();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      const indicator = target?.closest(selector);
      if (indicator) changed.add(indicator);
      if (record.type === "attributes")
        target?.querySelectorAll(selector).forEach((el) => changed.add(el));
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
  });
  return {
    isFresh: (el: Element) => !stale.has(el) || changed.has(el),
    disconnect: () => observer.disconnect(),
  };
}

// Compare monetary amounts in cents; floating point deltas must not decide ties.
function cents(value: number): number { return Math.round(value * 100); }

class ComparisonError extends Error {
  constructor(readonly reason: NonNullable<CouponApplyResultMessage['failureReason']>) { super(reason); }
}

(async function main() {
  const context = window.__SAVERLLY__;
  if (!context?.coupons?.length || window.__SAVERLLY_APPLYING__) return;
  window.__SAVERLLY_APPLYING__ = true;
  const { merchantId, recipe, coupons } = context;
  const ordered = sortCouponsBySuccessLikelihood(coupons).filter((coupon, index, all) =>
    all.findIndex(other => other.code === coupon.code) === index);
  const testedCodes: Array<{ code: string; saved: boolean }> = [];
  let baseline: number | null = null;
  let currentCode: string | null = null;
  let originalCode: string | null = null;
  let best: { coupon: typeof ordered[number]; total: number } | null = null;
  const send = (message: CouponApplyResultMessage | CouponApplyProgressMessage) => {
    // Telemetry delivery cannot hold a merchant's checkout open.
    void Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => {});
  };
  const finish = (result: CouponApplyResultMessage['result'], extra: Partial<CouponApplyResultMessage> = {}) =>
    send({ type: 'COUPON_APPLY_RESULT', merchantId, couponId: null, code: null, result,
      isFinal: true, testedCount: testedCodes.length, ...extra });

  async function resetCart(): Promise<void> {
    if (!currentCode) return;
    const remove = recipe.removeCouponSelector
      ? document.querySelector<HTMLElement>(recipe.removeCouponSelector) : null;
    if (!remove) throw new ComparisonError('restore_failed');
    remove.click();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let stableSince = 0;
    while (Date.now() < deadline) {
      const value = readTotal(recipe.cartTotalSelector);
      if (value !== null && baseline !== null && cents(value) === cents(baseline)) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 500) { currentCode = null; return; }
      } else stableSince = 0;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new ComparisonError('restore_failed');
  }

  async function attempt(code: string): Promise<{ outcome: 'success' | 'failure' | 'timeout'; total: number | null }> {
    await revealCouponField(recipe.couponFieldSelector, recipe.couponFieldRevealSelector);
    const field = document.querySelector<HTMLInputElement>(recipe.couponFieldSelector);
    const button = document.querySelector<HTMLElement>(recipe.applyButtonSelector);
    if (!field || !button) throw new ComparisonError('checkout_changed');
    const indicators = observeIndicators(recipe.successIndicatorSelector, recipe.failureIndicatorSelector);
    try {
      setFieldValue(field, code);
      button.click();
      await Promise.resolve();
      const outcome = await waitForIndicator(recipe.successIndicatorSelector, recipe.failureIndicatorSelector, indicators.isFresh);
      if (outcome !== 'success') return { outcome, total: readTotal(recipe.cartTotalSelector) };
      currentCode = code;
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let previous: number | null = null;
      let stableSince = Date.now();
      while (Date.now() < deadline) {
        const value = readTotal(recipe.cartTotalSelector);
        if (value !== previous) { previous = value; stableSince = Date.now(); }
        if (value !== null && baseline !== null && cents(value) < cents(baseline) && Date.now() - stableSince >= 500)
          return { outcome, total: value };
        await sleep(POLL_INTERVAL_MS);
      }
      return { outcome, total: readTotal(recipe.cartTotalSelector) };
    } finally { indicators.disconnect(); }
  }

  try {
    await revealCouponField(recipe.couponFieldSelector, recipe.couponFieldRevealSelector);
    if (!document.querySelector(recipe.couponFieldSelector) || !document.querySelector(recipe.applyButtonSelector)) {
      finish('no_coupons_available'); return;
    }
    if (ordered.length > 1 && (!recipe.couponApplyMode || (recipe.couponApplyMode === 'remove' && !recipe.removeCouponSelector)))
      throw new ComparisonError('comparison_unavailable');
    // Never remove an already-applied shopper code whose original value we cannot restore.
    if (recipe.removeCouponSelector && Array.from(document.querySelectorAll(recipe.removeCouponSelector)).some(isVisible))
      throw new ComparisonError('checkout_changed');
    baseline = readTotal(recipe.cartTotalSelector);
    if (baseline === null) throw new ComparisonError('unconfirmed');
    if (Array.from(document.querySelectorAll(recipe.successIndicatorSelector)).some(isVisible)) {
      originalCode = document.querySelector<HTMLInputElement>(recipe.couponFieldSelector)?.value.trim() || null;
      if (!originalCode) throw new ComparisonError('checkout_changed');
    }
    for (const [index, coupon] of ordered.entries()) {
      if (recipe.couponApplyMode === 'remove') await resetCart();
      send({ type: 'COUPON_APPLY_PROGRESS', phase: 'testing', code: coupon.code,
        index: index + 1, total: ordered.length, testedCodes: [...testedCodes] });
      const trial = await attempt(coupon.code);
      if (trial.outcome === 'timeout') throw new ComparisonError('unconfirmed');
      const saved = trial.outcome === 'success' && trial.total !== null && cents(trial.total) < cents(baseline);
      testedCodes.push({ code: coupon.code, saved });
      if (saved && trial.total !== null && (!best || cents(trial.total) < cents(best.total)))
        best = { coupon, total: trial.total };
      send({ type: 'COUPON_APPLY_RESULT', merchantId, couponId: coupon.id, code: coupon.code,
        result: saved ? 'applied' : 'failed', isFinal: false });
    }
    if (!best) {
      if (originalCode && currentCode !== originalCode) {
        const restored = await attempt(originalCode);
        if (restored.outcome !== 'success' || restored.total === null || cents(restored.total) !== cents(baseline))
          throw new ComparisonError('restore_failed');
      } else if (currentCode && recipe.removeCouponSelector) await resetCart();
      const finalTotal = readTotal(recipe.cartTotalSelector);
      if (finalTotal === null || cents(finalTotal) > cents(baseline)) throw new ComparisonError('restore_failed');
      finish('failed'); return;
    }
    send({ type: 'COUPON_APPLY_PROGRESS', phase: 'applying', code: best.coupon.code,
      index: ordered.length, total: ordered.length, testedCodes: [...testedCodes] });
    if (currentCode !== best.coupon.code || cents(readTotal(recipe.cartTotalSelector) ?? -1) !== cents(best.total)) {
      if (recipe.couponApplyMode === 'remove') await resetCart();
      const reapplied = await attempt(best.coupon.code);
      if (reapplied.outcome !== 'success' || reapplied.total === null || cents(reapplied.total) !== cents(best.total))
        throw new ComparisonError('restore_failed');
    }
    finish('applied', { couponId: best.coupon.id, code: best.coupon.code,
      originalTotal: baseline, newTotal: best.total, discountAmount: (cents(baseline) - cents(best.total)) / 100 });
  } catch (error) {
    // Only remove discounts this run owns, and only through a merchant-provided control.
    if (originalCode && currentCode && baseline !== null) {
      try {
        const restored = await attempt(originalCode);
        if (restored.outcome !== 'success' || restored.total === null || cents(restored.total) !== cents(baseline)) throw new Error();
      } catch { error = new ComparisonError('restore_failed'); }
    } else if (currentCode && recipe.removeCouponSelector) {
      try { await resetCart(); } catch { error = new ComparisonError('restore_failed'); }
    }
    finish('failed', { failureReason: error instanceof ComparisonError ? error.reason : 'unconfirmed' });
  } finally { window.__SAVERLLY_APPLYING__ = false; }
})();
