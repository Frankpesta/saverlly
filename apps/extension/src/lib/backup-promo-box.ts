import { element as findElement, isVisible } from "./checkout-dom";
import { generateSelector } from "./selector-generator";
import { isTextField, suggestApplyButton } from "./setup-heuristics";

// Keeping stores working: when a store's saved promo box selector no longer finds anything, look
// for an obvious promo box on the page ourselves. Finding one is both the evidence the store's
// setup is out of date (a checkout step without a promo box reports nothing) and, with an apply
// button beside it, a way for shoppers to still get a code until an admin re-checks the store.

const PROMO_WORDS = /promo|coupon|discount|voucher|reduction|redeem|gift\s*card|offer\s*code/i;
// Never mistaken for a promo box, whatever else they say.
const NOT_PROMO = /e-?mail|search|newsletter|zip|post(?:al)?\s*code|card\s*number|cvv|cvc|security\s*code|expir|password|phone/i;

function describe(field: HTMLInputElement | HTMLTextAreaElement): string {
  const labelledBy = (field.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => (id ? document.getElementById(id)?.textContent : ""));
  return [
    field.name,
    field.id,
    field.getAttribute("placeholder"),
    field.getAttribute("aria-label"),
    field.getAttribute("autocomplete"),
    ...Array.from(field.labels ?? [], (label) => label.textContent),
    ...labelledBy,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface BackupSelectors {
  couponFieldSelector: string;
  applyButtonSelector: string;
}

/** The one obvious promo box on the page, if there is exactly one. */
export function findObviousPromoBox(): HTMLInputElement | HTMLTextAreaElement | null {
  const boxes = Array.from(document.querySelectorAll("input, textarea")).filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement => {
      if (!isTextField(el) || el.disabled || el.readOnly || !isVisible(el)) return false;
      const text = describe(el);
      return PROMO_WORDS.test(text) && !NOT_PROMO.test(text);
    },
  );
  return boxes.length === 1 ? boxes[0] : null;
}

/** Selectors for that box and its apply button, or null unless both are certain. */
export function backupSelectors(field: Element): BackupSelectors | null {
  const button = suggestApplyButton(field);
  if (!button) return null;
  const forField = generateSelector(field);
  const forButton = generateSelector(button);
  if (!forField.ok || !forButton.ok) return null;
  // The shopper's coupon run looks elements up the same way; it must land on these two.
  if (findElement(forField.selector) !== field || findElement(forButton.selector) !== button) return null;
  return { couponFieldSelector: forField.selector, applyButtonSelector: forButton.selector };
}
