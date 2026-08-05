import { parseCartTotal, sortCouponsBySuccessLikelihood } from '../lib/cart-total';
import type { CouponApplyProgressMessage, CouponApplyResultMessage } from '../lib/messages';

const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readTotal(selector: string): number | null {
  const el = document.querySelector(selector);
  if (!el?.textContent) return null;
  return parseCartTotal(el.textContent);
}

// Merchant checkout pages commonly pre-render both indicators hidden (display:none) and
// only reveal one after the apply request resolves — matching on DOM presence alone would
// report success/failure immediately regardless of which one the page actually surfaces.
function isVisible(el: Element): boolean {
  return (el as HTMLElement).offsetParent !== null;
}

async function waitForIndicator(successSelector: string, failureSelector: string): Promise<'success' | 'failure' | 'timeout'> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const successEl = document.querySelector(successSelector);
    if (successEl && isVisible(successEl)) return 'success';
    const failureEl = document.querySelector(failureSelector);
    if (failureEl && isVisible(failureEl)) return 'failure';
    await sleep(POLL_INTERVAL_MS);
  }
  return 'timeout';
}

function setFieldValue(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

(async function main() {
  const context = window.__SAVERLLY__;
  if (!context?.coupons?.length) return;

  const { merchantId, recipe, coupons } = context;
  const ordered = sortCouponsBySuccessLikelihood(coupons);
  const total = ordered.length;

  for (const [i, coupon] of ordered.entries()) {
    const field = document.querySelector<HTMLInputElement>(recipe.couponFieldSelector);
    const applyButton = document.querySelector<HTMLElement>(recipe.applyButtonSelector);
    if (!field || !applyButton) continue;

    const testingProgress: CouponApplyProgressMessage = {
      type: 'COUPON_APPLY_PROGRESS',
      phase: 'testing',
      code: coupon.code,
      index: i + 1,
      total,
    };
    chrome.runtime.sendMessage(testingProgress);

    const preApplyTotal = readTotal(recipe.cartTotalSelector);
    setFieldValue(field, coupon.code);
    applyButton.click();

    const outcome = await waitForIndicator(recipe.successIndicatorSelector, recipe.failureIndicatorSelector);

    let result: CouponApplyResultMessage['result'] = 'failed';
    let postApplyTotal: number | null = null;
    if (outcome === 'success') {
      const applyingProgress: CouponApplyProgressMessage = {
        type: 'COUPON_APPLY_PROGRESS',
        phase: 'applying',
        code: coupon.code,
        index: i + 1,
        total,
      };
      chrome.runtime.sendMessage(applyingProgress);

      postApplyTotal = readTotal(recipe.cartTotalSelector);
      const discountConfirmed =
        preApplyTotal !== null && postApplyTotal !== null && postApplyTotal < preApplyTotal;
      result = discountConfirmed ? 'applied' : 'failed';
    }

    const message: CouponApplyResultMessage = {
      type: 'COUPON_APPLY_RESULT',
      merchantId,
      couponId: coupon.id,
      code: coupon.code,
      result,
      isFinal: result === 'applied' || i === total - 1,
      ...(result === 'applied' && preApplyTotal !== null && postApplyTotal !== null
        ? { discountAmount: preApplyTotal - postApplyTotal, originalTotal: preApplyTotal, newTotal: postApplyTotal }
        : {}),
    };
    chrome.runtime.sendMessage(message);

    if (result === 'applied') return;
  }
})();
