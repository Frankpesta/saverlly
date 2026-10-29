import type { SetupOverlay } from "./setup-overlay";

// Pick mode: the admin points at part of the checkout and clicks it, and setup records which
// element that was. While picking, the store never sees the click (or the pointer and mouse
// events frameworks act on before it), so choosing the Apply button can't submit the checkout.
// A pass-through pick lets the click reach the store instead, for the step where the admin
// opens a hidden promo box by clicking its link.

export type PickOutcome =
  | { kind: "picked"; element: Element }
  | { kind: "cancelled" }
  /** The element can't be used by a recipe: recipes act on the top page only. */
  | { kind: "unsupported"; reason: "frame" | "shadow-root" };

export interface PickOptions {
  overlay: SetupOverlay;
  /** Label shown on the outline while hovering ("Promo code box"). */
  label: string;
  /** Let the click through to the store as well as recording it. */
  passThrough?: boolean;
  /** Maps the element under the pointer to the one to record (e.g. the button around an
   *  icon). Returning null means "not this": nothing is outlined and clicks are ignored. */
  resolve?: (target: Element) => Element | null;
  signal?: AbortSignal;
}

// Everything a store might act on before or instead of "click" while the admin is choosing.
const BLOCKED_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "touchstart",
  "touchend",
] as const;

/** The interactive element around what was clicked, so a click on a button's icon or label
 *  text still records the button itself. Anything else is recorded as clicked. */
export function actionable(target: Element): Element {
  return (
    target.closest(
      'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], label',
    ) ?? target
  );
}

/** The element the event really happened on, looking through open shadow roots. */
function eventTarget(event: Event): Element | null {
  const first = event.composedPath()[0];
  return first instanceof Element ? first : null;
}

// Only one pick is ever live: a second one would fight the first over the same events.
let cancelActivePick: (() => void) | null = null;
// Set only while clickPastPicker dispatches its click (click() runs synchronously).
let bypass = false;

/** Clicks `element` on the admin's behalf without it counting as a pick, e.g. re-opening a
 *  hidden promo box from the panel while the admin is choosing the box itself. */
export function clickPastPicker(element: HTMLElement): void {
  bypass = true;
  try {
    element.click();
  } finally {
    bypass = false;
  }
}

export function pick(options: PickOptions): Promise<PickOutcome> {
  cancelActivePick?.();
  const { overlay, label, passThrough = false, signal } = options;
  const resolve = options.resolve ?? ((target: Element) => target);

  return new Promise((done) => {
    let finished = false;
    const finish = (outcome: PickOutcome) => {
      if (finished) return;
      finished = true;
      if (cancelActivePick === cancelThis) cancelActivePick = null;
      for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onPress, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      signal?.removeEventListener("abort", onAbort);
      document.documentElement.style.cursor = previousCursor;
      overlay.highlight(null);
      done(outcome);
    };

    const inspect = (event: Event): { inOverlay: boolean; element: Element | null; unsupported?: "frame" | "shadow-root" } => {
      if (overlay.owns(event.target)) return { inOverlay: true, element: null };
      const target = eventTarget(event);
      if (!target) return { inOverlay: false, element: null };
      if (target.getRootNode() !== document) return { inOverlay: false, element: target, unsupported: "shadow-root" };
      if (target.localName === "iframe" || target.localName === "frame")
        return { inOverlay: false, element: target, unsupported: "frame" };
      return { inOverlay: false, element: resolve(target) };
    };

    const onMove = (event: Event) => {
      const { inOverlay, element, unsupported } = inspect(event);
      if (inOverlay) return overlay.highlight(null);
      overlay.highlight(element, unsupported ? "Can't be used by Saverlly" : label, unsupported ? "error" : "info");
    };

    const onPress = (event: Event) => {
      if (bypass) return;
      const { inOverlay, element, unsupported } = inspect(event);
      if (inOverlay) return; // The admin is using the panel itself.
      if (!passThrough) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (event.type !== "click") return;
      if (unsupported) return finish({ kind: "unsupported", reason: unsupported });
      if (element) finish({ kind: "picked", element });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish({ kind: "cancelled" });
    };

    // A click inside a frame never reaches this page; the only sign of it is focus moving
    // into the <iframe> element.
    const onBlur = () =>
      setTimeout(() => {
        const active = document.activeElement;
        if (!finished && (active?.localName === "iframe" || active?.localName === "frame"))
          finish({ kind: "unsupported", reason: "frame" });
      }, 0);

    const onAbort = () => finish({ kind: "cancelled" });
    const cancelThis = () => finish({ kind: "cancelled" });

    const previousCursor = document.documentElement.style.cursor;
    if (signal?.aborted) return finish({ kind: "cancelled" });
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onPress, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    signal?.addEventListener("abort", onAbort);
    cancelActivePick = cancelThis;
    document.documentElement.style.cursor = "crosshair";
  });
}
