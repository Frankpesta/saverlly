import { matchesCheckoutUrl } from "../lib/checkout-match";
import { element } from "../lib/checkout-dom";
import type { CheckoutConfirmedMessage } from "../lib/messages";

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
  let confirmed = false;
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
    confirmed = true;
    observer?.disconnect();
    const message: CheckoutConfirmedMessage = {
      type: "CHECKOUT_CONFIRMED",
      merchantId,
      referrer: document.referrer,
    };
    void Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => {});
  }
  check();
  if (confirmed) return;
  observer = new MutationObserver(check);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  // One observer per frame, replaced on re-injection and destroyed with the document.
  // No arbitrary hydration deadline: slow checkout/auth flows must still be detected.
  window.__SAVERLLY_DETECTOR__ = () => observer?.disconnect();
})();
