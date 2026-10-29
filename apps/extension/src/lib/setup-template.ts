import {
  detectStorePlatform,
  PLATFORM_TEMPLATES,
  type PlatformTemplate,
  type StorePlatform,
} from "@saverlly/shared-types";
import { readTotal } from "./checkout-actions";
import { elements, isVisible } from "./checkout-dom";
import { matchesCheckoutUrl } from "./checkout-match";
import { isButtonLike, isRevealControl, isTextField } from "./setup-heuristics";
import type { PickedElement, PickKey } from "./setup-flow";

// Starting store setup from the platform's template: on a store that runs on Shopify,
// WooCommerce or BigCommerce, the parts of the checkout that look the way they do on every store
// of that platform are filled in without the admin clicking them. A template selector is used
// only where it matches exactly one visible element of the right kind on this very page; any
// other part is left for the admin to click, and the final test proves the result either way.

/** The platform this page belongs to, from its HTML (scripts, links, classes). */
export function detectPagePlatform(): StorePlatform | null {
  return detectStorePlatform(document.documentElement.outerHTML)?.platform ?? null;
}

export function templateFor(platform: StorePlatform | null): PlatformTemplate | null {
  return (platform && PLATFORM_TEMPLATES[platform]) || null;
}

export interface TemplateMatch {
  pattern?: string;
  reveal?: "visible" | "link";
  picks: Partial<Record<PickKey, PickedElement>>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The only visible element `selector` matches, if `accept` takes it. */
function onlyVisible(selector: string, accept: (el: HTMLElement) => boolean): HTMLElement | null {
  const visible = elements(selector).filter(isVisible);
  return visible.length === 1 && accept(visible[0]) ? visible[0] : null;
}

function firstMatch(
  candidates: string[] | undefined,
  accept: (el: HTMLElement) => boolean,
): { selector: string; element: HTMLElement } | null {
  for (const selector of candidates ?? []) {
    const element = onlyVisible(selector, accept);
    if (element) return { selector, element };
  }
  return null;
}

const asPick = (selector: string): PickedElement => ({ selector, strategy: "template", exact: true });

/**
 * Fills in what the template recognises on this page. A promo box hidden behind the platform's
 * own "Have a coupon?" link is opened by clicking that link, as the shopper's coupon run would.
 */
export async function matchTemplate(
  template: PlatformTemplate,
  { revealWaitMs = 2_000 }: { revealWaitMs?: number } = {},
): Promise<TemplateMatch> {
  const match: TemplateMatch = { picks: {} };
  match.pattern = template.checkoutUrlPatterns.find((pattern) => matchesCheckoutUrl(location.href, [pattern]));

  let field = firstMatch(template.promoField, isTextField);
  if (field) match.reveal = "visible";
  else {
    const reveal = firstMatch(template.revealLink, isRevealControl);
    if (reveal) {
      reveal.element.click();
      for (let waited = 0; !field && waited < revealWaitMs; waited += 100) {
        await sleep(100);
        field = firstMatch(template.promoField, isTextField);
      }
      if (field) {
        match.reveal = "link";
        match.picks.revealLink = asPick(reveal.selector);
      }
    }
  }
  if (field) match.picks.promoField = asPick(field.selector);

  const button = firstMatch(template.applyButton, isButtonLike);
  if (button && field && !button.element.contains(field.element)) match.picks.applyButton = asPick(button.selector);

  const total = firstMatch(template.cartTotal, () => true);
  if (total && readTotal(total.selector) !== null) match.picks.cartTotal = asPick(total.selector);
  return match;
}
