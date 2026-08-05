import { parseCartTotal, sortCouponsBySuccessLikelihood } from '../lib/cart-total';
import type { CouponApplyResultMessage } from '../lib/messages';

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

async function waitForIndicator(successSelector: string, failureSelector: string): Promise<'success' | 'failure' | 'timeout'> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (document.querySelector(successSelector)) return 'success';
    if (document.querySelector(failureSelector)) return 'failure';
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

  for (const coupon of ordered) {
    const field = document.querySelector<HTMLInputElement>(recipe.couponFieldSelector);
    const applyButton = document.querySelector<HTMLElement>(recipe.applyButtonSelector);
    if (!field || !applyButton) continue;

    const preApplyTotal = readTotal(recipe.cartTotalSelector);
    setFieldValue(field, coupon.code);
    applyButton.click();

    const outcome = await waitForIndicator(recipe.successIndicatorSelector, recipe.failureIndicatorSelector);

    let result: CouponApplyResultMessage['result'] = 'failed';
    if (outcome === 'success') {
      const postApplyTotal = readTotal(recipe.cartTotalSelector);
      const discountConfirmed =
        preApplyTotal !== null && postApplyTotal !== null && postApplyTotal < preApplyTotal;
      result = discountConfirmed ? 'applied' : 'failed';
    }

    const message: CouponApplyResultMessage = {
      type: 'COUPON_APPLY_RESULT',
      merchantId,
      couponId: coupon.id,
      result,
    };
    chrome.runtime.sendMessage(message);

    if (result === 'applied') return;
  }
})();
