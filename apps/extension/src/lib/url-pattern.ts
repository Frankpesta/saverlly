import { matchesCheckoutUrl } from "./checkout-match";

// Turns the checkout address an admin is on into a recipe checkoutUrlPattern. Patterns are
// matched unanchored against path + hash (see checkout-match.ts), so a pattern only needs the
// stable part of the path that identifies the checkout: "/checkouts/c/*" matches every step of
// every shopper's checkout, while the full path would match only this admin's session.

export type CheckoutUrlPatternResult =
  | { ok: true; pattern: string }
  | { ok: false; reason: "too-broad" | "invalid-url" };

// The last part of many checkout paths is the step the admin happens to be on. The promo box
// often shows on several steps, so the pattern stops before it.
const STEP_SEGMENT =
  /^(?:information|contact|contact-information|details|shipping|delivery|billing|payment|review|confirm|summary|step|step-?\d+)$/;
// Locale segments vary per shopper ("/en-us/checkout" vs "/en-gb/checkout").
const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/;

/** A path segment that differs between checkouts or sessions: IDs, tokens and hashes. */
export function isVariableSegment(segment: string): boolean {
  return (
    /^\d+$/.test(segment) ||
    (/^[0-9a-f-]{8,}$/.test(segment) && /\d/.test(segment)) ||
    // Session tokens: long, mixing letters and digits ("hwn1abcd2efgh", "c1-3f9a…").
    (/^[\w-]{12,}$/.test(segment) && /\d/.test(segment) && /[a-z]/.test(segment)) ||
    segment.length > 40
  );
}

// A locale alone ("/en-us") is the whole localized site, not a page, so it doesn't count.
const isFixed = (token: string) => token !== "*" && !LOCALE_SEGMENT.test(token);

export function checkoutUrlPattern(href: string): CheckoutUrlPatternResult {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  // Exactly the text matchesCheckoutUrl tests patterns against: lowercased path + hash.
  const tokens = (url.pathname + url.hash.replace(/^#/, ""))
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .map((segment) => (isVariableSegment(segment) ? "*" : segment));

  // Leading locales and trailing steps, locales and IDs say nothing about which store page this
  // is. Each is trimmed only while a fixed segment would still be left.
  const keepsFixed = (rest: string[]) => rest.some(isFixed);
  while (tokens.length > 1 && LOCALE_SEGMENT.test(tokens[0]) && keepsFixed(tokens.slice(1)))
    tokens.shift();
  for (;;) {
    const last = tokens.at(-1);
    if (last === undefined) break;
    const trimmable = last === "*" || STEP_SEGMENT.test(last) || LOCALE_SEGMENT.test(last);
    if (!trimmable || !keepsFixed(tokens.slice(0, -1))) break;
    tokens.pop();
  }
  const collapsed = tokens.filter((token, i) => token !== "*" || tokens[i - 1] !== "*");

  // With no fixed segment the pattern would match every page on the store.
  if (!collapsed.some(isFixed)) return { ok: false, reason: "too-broad" };
  const pattern = `/${collapsed.join("/")}`;
  // Guaranteed by construction; checked so a future edit here can't silently ship a pattern
  // that misses the very page it was made from.
  if (!matchesCheckoutUrl(href, [pattern])) return { ok: false, reason: "invalid-url" };
  return { ok: true, pattern };
}
