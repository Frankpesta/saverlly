import { matchesCheckoutUrl } from '../lib/checkout-match';
import type { CheckoutConfirmedMessage } from '../lib/messages';

(function main() {
  const context = window.__SAVERLLY__;
  if (!context) return;

  const { merchantId, recipe } = context;

  if (!matchesCheckoutUrl(window.location.href, recipe.checkoutUrlPatterns)) return;

  const hasCouponField = document.querySelector(recipe.couponFieldSelector) !== null;
  const hasCartTotal = document.querySelector(recipe.cartTotalSelector) !== null;
  if (!hasCouponField || !hasCartTotal) return;

  const message: CheckoutConfirmedMessage = {
    type: 'CHECKOUT_CONFIRMED',
    merchantId,
    referrer: document.referrer,
  };
  chrome.runtime.sendMessage(message);
})();
