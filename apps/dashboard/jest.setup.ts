import "@testing-library/jest-dom";

// jsdom doesn't implement the Pointer Events APIs Radix UI's Select/Dialog primitives
// call into (hasPointerCapture, setPointerCapture, scrollIntoView) — polyfill as no-ops
// so interactions in components built on radix-ui don't throw in tests.
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.HTMLElement.prototype.setPointerCapture ??= () => {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.scrollIntoView ??= () => {};

  // Radix's Select (and other size-aware primitives) use ResizeObserver, which jsdom also
  // doesn't implement. A fully inert stub isn't enough — Radix awaits the callback firing
  // at least once to resolve its internal "measured" state, and a stub that never calls it
  // leaves that state pending forever (observed as hung/timed-out tests, not just a thrown
  // error). Calling back synchronously with the target's real (zero) bounding rect unblocks it.
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class ResizeObserver {
      #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(target: Element) {
        this.#callback(
          [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
          this,
        );
      }
      unobserve() {}
      disconnect() {}
    };
  }
}
