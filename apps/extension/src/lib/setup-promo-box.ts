import { isVisible } from "./checkout-dom";
import { pastPicker } from "./setup-picker";

// Some stores open the promo box in a drawer or popup that covers the whole checkout
// (Target: a React-Modal drawer with a see-through backdrop over the page). While it is open,
// every click on the page lands on the drawer or its backdrop, so the admin can't choose the
// order total, and the picker blocks the clicks (and Esc) that would close it. These helpers
// find that drawer and close it on the admin's behalf.

const MODAL = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const CLOSE_LABEL = /\b(?:close|dismiss|cancel)\b|^[×✕✖xX]$/;
const CLOSE_CLASS = /close|dismiss/i;
const CLOSE_WAIT_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The open drawer or popup the promo box sits in, or null when the box is part of the page. */
export function promoBoxModal(field: Element | null): HTMLElement | null {
  if (!field?.isConnected || !isVisible(field)) return null;
  const modal = field.closest<HTMLElement>(MODAL);
  return modal && isVisible(modal) ? modal : null;
}

function labelOf(el: Element): string {
  return (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.textContent ?? "").trim();
}

/** The drawer's own close control: a labelled "Close"/× first, then one only styled as one. */
export function closeControl(modal: HTMLElement, field: Element): HTMLElement | null {
  const controls = Array.from(
    modal.querySelectorAll<HTMLElement>('button, [role="button"], a[href]'),
  ).filter((el) => isVisible(el) && !el.contains(field) && !(el instanceof HTMLButtonElement && el.type === "submit"));
  return (
    controls.find((el) => CLOSE_LABEL.test(labelOf(el))) ??
    controls.find((el) => CLOSE_CLASS.test(el.className.toString())) ??
    null
  );
}

/** A see-through layer stretched over the whole viewport (a modal's backdrop). */
export function isBackdrop(el: Element): boolean {
  if (getComputedStyle(el).position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
}

function pressEscape(target: Element): void {
  const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  // Older modal libraries still read keyCode, which the constructor leaves at 0.
  Object.defineProperty(event, "keyCode", { get: () => 27 });
  Object.defineProperty(event, "which", { get: () => 27 });
  target.dispatchEvent(event);
}

/**
 * Closes the drawer around the promo box: its close control, else Esc. Resolves true once the
 * drawer is gone (removed, hidden, or the box no longer visible), false if it stayed open.
 */
export async function closePromoBoxModal(field: Element): Promise<boolean> {
  const modal = promoBoxModal(field);
  if (!modal) return true;
  const closed = () => !promoBoxModal(field);
  const control = closeControl(modal, field);
  pastPicker(() => (control ? control.click() : pressEscape(modal)));
  for (let waited = 0; waited < CLOSE_WAIT_MS; waited += 100) {
    await sleep(100);
    if (closed()) return true;
  }
  if (control) {
    // The control we found wasn't the right one; Esc closes most drawers.
    pastPicker(() => pressEscape(modal));
    for (let waited = 0; waited < CLOSE_WAIT_MS; waited += 100) {
      await sleep(100);
      if (closed()) return true;
    }
  }
  return false;
}
