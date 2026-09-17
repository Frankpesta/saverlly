import { normalizeCheckoutSelector } from "@saverlly/shared-types";
// A stale server-provided selector must not crash checkout detection.
export function elements(selector?: string): HTMLElement[] {
  if (!selector?.trim()) return [];
  try {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        normalizeCheckoutSelector(selector),
      ),
    );
  } catch {
    return [];
  }
}
export function isVisible(el: Element): boolean {
  return (
    getComputedStyle(el).visibility !== "hidden" &&
    ((el as HTMLElement).offsetParent !== null ||
      el.getClientRects().length > 0)
  );
}
export function element<T extends HTMLElement = HTMLElement>(
  selector?: string,
): T | null {
  const matches = elements(selector);
  return (matches.find(isVisible) ?? matches[0] ?? null) as T | null;
}
