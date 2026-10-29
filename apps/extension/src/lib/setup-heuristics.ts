// Small judgements store setup makes about what the admin clicked: is it a text box, a button,
// a price; which button probably applies the code. Kept apart from the flow so each rule can be
// tested against real checkout markup on its own.

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "tel"]);

export function isTextField(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has((element.getAttribute("type") ?? "").toLowerCase());
}

/** The text box an admin meant when clicking it, its label, or a wrapper holding just one. */
export function promoFieldFor(target: Element): Element {
  if (isTextField(target)) return target;
  if (target instanceof HTMLLabelElement && target.control && isTextField(target.control)) return target.control;
  const inside = Array.from(target.querySelectorAll("input, textarea")).filter(isTextField);
  return inside.length === 1 ? inside[0] : target;
}

export function isButtonLike(element: Element): boolean {
  if (element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLInputElement) return ["submit", "button", "image"].includes(element.type);
  const role = element.getAttribute("role");
  return role === "button" || role === "link" || (element instanceof HTMLAnchorElement && element.hasAttribute("href"));
}

/** Something a shopper clicks to show a hidden promo box: a link, button, toggle or label. */
export function isRevealControl(element: Element): boolean {
  return (
    isButtonLike(element) ||
    element.localName === "summary" ||
    element.localName === "label" ||
    element.getAttribute("aria-expanded") !== null
  );
}

const APPLY_WORDS = /\b(?:apply|redeem|submit|use|add|activate|ok|go)\b|→|›/i;
const NOT_APPLY_WORDS = /\b(?:remove|delete|clear|cancel|close)\b/i;

function labelOf(button: Element): string {
  return (
    button.getAttribute("aria-label") ??
    (button instanceof HTMLInputElement ? button.value : button.textContent) ??
    ""
  ).trim();
}

function buttonsIn(root: Element, exclude: Element[]): Element[] {
  return Array.from(
    root.querySelectorAll('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"]'),
  ).filter(
    (b) =>
      !exclude.some((e) => e === b || e.contains(b)) &&
      !NOT_APPLY_WORDS.test(labelOf(b)) &&
      !(b instanceof HTMLButtonElement && b.type === "reset"),
  );
}

/**
 * The button that most likely applies the code typed into `field`: the form's own submit
 * button, else the nearest button around the field that reads like "Apply". Never one of
 * `exclude` (the promo code link) or a remove/cancel control. Null when nothing is a confident
 * guess; the admin then picks it.
 */
export function suggestApplyButton(field: Element, exclude: Element[] = []): Element | null {
  const form = field.closest("form");
  if (form) {
    const own = buttonsIn(form, exclude);
    const labelled = own.find((b) => APPLY_WORDS.test(labelOf(b)));
    if (labelled) return labelled;
    if (own.length === 1) return own[0];
  }
  // No form (common in React checkouts): look outwards a few levels for a nearby Apply button.
  let scope: Element | null = field.parentElement;
  for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
    const nearby = buttonsIn(scope, exclude).filter((b) => APPLY_WORDS.test(labelOf(b)));
    if (nearby.length === 1) return nearby[0];
    if (nearby.length > 1) break;
  }
  return null;
}
