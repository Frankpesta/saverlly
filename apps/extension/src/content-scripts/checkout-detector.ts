import { backupSelectors, findObviousPromoBox, type BackupSelectors } from "../lib/backup-promo-box";
import { readTotal } from "../lib/checkout-actions";
import { matchesCheckoutUrl } from "../lib/checkout-match";
import { element } from "../lib/checkout-dom";
import type { CheckoutConfirmedMessage, RecipeHealthMessage } from "../lib/messages";

// Long enough for a checkout to finish drawing itself before its recipe is judged.
const HEALTH_CHECK_MS = 8_000;

(function main() {
  window.__SAVERLLY_DETECTOR__?.();
  const context = window.__SAVERLLY__;
  if (!context) return;
  const { merchantId, recipe } = context;
  const url = context.checkoutUrl ?? window.location.href;
  const cart = /\/(?:co-)?cart(?:[/?#]|$)/i.test(new URL(url).pathname);
  // Some older recipes only list checkout, but expose a configured coupon reveal on cart.
  if (
    !matchesCheckoutUrl(url, recipe.checkoutUrlPatterns ?? []) &&
    !(cart && recipe.couponFieldRevealSelector)
  )
    return;
  let observer: MutationObserver | undefined;
  let healthTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmed = false;
  const topFrame = window === window.top;
  const send = (message: CheckoutConfirmedMessage | RecipeHealthMessage) =>
    void Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => {});
  function confirm(backup?: BackupSelectors): void {
    confirmed = true;
    observer?.disconnect();
    clearTimeout(healthTimer);
    send({
      type: "CHECKOUT_CONFIRMED",
      merchantId,
      referrer: document.referrer,
      ...(backup ? { backup } : {}),
    });
  }
  function check(): void {
    if (
      confirmed ||
      !element(recipe.cartTotalSelector) ||
      !(
        element(recipe.couponFieldSelector) ||
        element(recipe.couponFieldRevealSelector)
      )
    )
      return;
    confirm();
    if (topFrame && judged) send({ type: "RECIPE_HEALTH", merchantId, ok: true });
  }
  // Keeping stores working: only with evidence the saved recipe is out of date, never just
  // because this checkout step has no promo box.
  // Judged on the recipe's own checkout pages only: a cart page let in for its reveal link
  // needn't show an order total.
  const judged = matchesCheckoutUrl(url, recipe.checkoutUrlPatterns ?? []);
  function checkHealth(): void {
    if (confirmed) return;
    if (element(recipe.couponFieldSelector)) {
      send({ type: "RECIPE_HEALTH", merchantId, ok: false, problem: "ORDER_TOTAL_CHANGED" });
      return;
    }
    const box = findObviousPromoBox();
    if (!box) return;
    send({ type: "RECIPE_HEALTH", merchantId, ok: false, problem: "PROMO_BOX_CHANGED" });
    // Shoppers can still get a code through it, as long as the saved order total still reads.
    const backup = backupSelectors(box);
    if (backup && readTotal(recipe.cartTotalSelector) !== null) confirm(backup);
  }
  check();
  if (confirmed) return;
  if (topFrame && judged) healthTimer = setTimeout(checkHealth, HEALTH_CHECK_MS);
  observer = new MutationObserver(check);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  // One observer per frame, replaced on re-injection and destroyed with the document.
  // No arbitrary hydration deadline: slow checkout/auth flows must still be detected.
  window.__SAVERLLY_DETECTOR__ = () => {
    observer?.disconnect();
    clearTimeout(healthTimer);
  };
})();
