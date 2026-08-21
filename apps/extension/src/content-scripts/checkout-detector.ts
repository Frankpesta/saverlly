import { matchesCheckoutUrl } from '../lib/checkout-match';
import type { CheckoutConfirmedMessage } from '../lib/messages';

// How long to keep watching for the checkout DOM to render before giving up. Real checkout
// SPAs (e.g. Shopify's client-rendered checkout, confirmed by hand against a live Allbirds
// checkout) mount the coupon field and cart summary asynchronously, well after this script
// runs — it's injected on webNavigation.onCommitted, which fires at navigation-commit time,
// long before hydration completes. 10s comfortably covers real-world hydration time without
// leaving a dangling observer indefinitely on pages that never turn out to be a real checkout.
const DETECTION_TIMEOUT_MS = 10_000;

(function main() {
  const context = window.__SAVERLLY__;
  if (!context) return;

  const { merchantId, recipe } = context;

  if (!matchesCheckoutUrl(window.location.href, recipe.checkoutUrlPatterns)) return;

  function checkoutElementsPresent(): boolean {
    return (
      document.querySelector(recipe.couponFieldSelector) !== null &&
      document.querySelector(recipe.cartTotalSelector) !== null
    );
  }

  function confirmCheckout(): void {
    const message: CheckoutConfirmedMessage = {
      type: 'CHECKOUT_CONFIRMED',
      merchantId,
      referrer: document.referrer,
    };
    chrome.runtime.sendMessage(message);
  }

  if (checkoutElementsPresent()) {
    confirmCheckout();
    return;
  }

  // Not there yet — a single synchronous check misses any checkout page that renders its
  // form client-side after initial navigation, so watch for it instead of assuming presence.
  const observer = new MutationObserver(() => {
    if (checkoutElementsPresent()) {
      observer.disconnect();
      confirmCheckout();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), DETECTION_TIMEOUT_MS);
})();
