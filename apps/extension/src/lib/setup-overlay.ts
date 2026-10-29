// The store setup step panel, drawn on top of a store's checkout while an admin sets it up.
//
// It lives in a closed shadow root on its own host element, so the store's CSS can't restyle
// it, the store's scripts can't read or click into it, and nothing here can leak styles into
// the store. All text is set with textContent: titles, store names and selectors come from the
// page or the server and are never parsed as markup. The system font stack is used instead of
// the popup's Rubik, which would have to be exposed to every website as a web-accessible file.

export type OverlayActionKind = "primary" | "secondary" | "link";

export interface OverlayAction {
  id: string;
  label: string;
  kind: OverlayActionKind;
  disabled?: boolean;
  onClick: () => void;
}

export interface OverlayView {
  /** 1-based position in the guided steps, when on one. */
  step?: { index: number; total: number };
  title: string;
  body: string;
  /** A short confirmation of what was found ("Promo code box selected"). */
  result?: string;
  /** Technical detail, shown small (the selector, the matched pattern). */
  detail?: string;
  /** A short list, for summaries. */
  notes?: string[];
  tone?: "info" | "error";
  actions: OverlayAction[];
}

const HOST_TAG = "saverlly-store-setup";

// Using the panel must not look like a click on the store's page: a promo drawer that closes on
// an outside click would shut every time the admin pressed Continue. These stop at the host on
// their way up, after the panel's own buttons have handled them, so the store's bubbling
// listeners (and React, whose root sits inside <body>) never see them. Capture-phase listeners
// on document still fire first, as for any event; they see only the bare host element.
const CONTAINED_EVENTS = [
  "pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick",
  "contextmenu", "touchstart", "touchend", "keydown", "keyup", "keypress", "focusin", "focusout",
] as const;

const STYLES = `
/* !important inside a shadow root outranks even the page's !important rules on the host. */
:host { all: initial !important; display: block !important; }
* { box-sizing: border-box; }
.panel {
  position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
  width: min(360px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: auto;
  padding: 18px 18px 16px; border-radius: 14px; background: #fff; color: #1b1c1c;
  border: 1px solid #e6e8e8; box-shadow: 0 12px 36px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  font: 400 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  -webkit-font-smoothing: antialiased; text-align: left; pointer-events: auto;
}
.panel[data-side="left"] { right: auto; left: 20px; }
.top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.brand { font-weight: 600; font-size: 13px; color: #43a99d; }
.store { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #6b6b6b; }
.icon { all: unset; cursor: pointer; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; color: #6b6b6b; font-size: 15px; line-height: 1; }
.icon:hover { background: #f1f3f3; color: #1b1c1c; }
.icon:focus-visible, button:focus-visible { outline: 2px solid #58c3b7; outline-offset: 2px; }
.step { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #6b6b6b; margin-bottom: 4px; }
.title { margin: 0 0 6px; font-size: 17px; font-weight: 600; line-height: 1.3; color: #000; overflow-wrap: anywhere; }
.body { margin: 0; color: #2b2d2d; overflow-wrap: anywhere; }
.result { margin: 12px 0 0; padding: 8px 10px; border-radius: 9px; background: rgba(88,195,183,.13); color: #1f6f66; font-weight: 500; overflow-wrap: anywhere; }
.panel[data-tone="error"] .result { background: #fdecec; color: #b42318; }
.notes { margin: 10px 0 0; padding-left: 18px; color: #2b2d2d; }
.notes li { margin: 3px 0; overflow-wrap: anywhere; }
.notes.marked { padding-left: 0; list-style: none; }
.detail { margin: 6px 0 0; font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; color: #6b6b6b; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
button.primary, button.secondary { all: unset; cursor: pointer; padding: 8px 14px; border-radius: 999px; font-size: 14px; font-weight: 500; line-height: 1.2; }
button.primary { background: #58c3b7; color: #fff; }
button.primary:hover { background: #43a99d; }
button.secondary { border: 1.5px solid #58c3b7; color: #2f8a80; }
button.secondary:hover { background: rgba(88,195,183,.13); }
button.link { all: unset; cursor: pointer; font-size: 13px; font-weight: 500; line-height: 1.2; color: #4b4d4d; text-decoration: underline; text-underline-offset: 2px; }
button[disabled] { opacity: .5; cursor: default; pointer-events: none; }
.highlight {
  position: fixed; z-index: 2147483646; pointer-events: none; display: none;
  border: 2px solid #58c3b7; border-radius: 4px; background: rgba(88,195,183,.12);
  box-shadow: 0 0 0 2px rgba(255,255,255,.85);
}
.highlight[data-tone="error"] { border-color: #e5484d; background: rgba(229,72,77,.1); }
.label {
  position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; max-width: 280px;
  padding: 2px 8px; border-radius: 6px; background: #1b1c1c; color: #fff;
  font: 500 12px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.highlight[data-below] .label { bottom: auto; top: 100%; margin: 4px 0 0; }
@media (prefers-reduced-motion: no-preference) { .panel { transition: left .15s, right .15s; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class SetupOverlay {
  private readonly host: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly content: HTMLElement;
  private readonly box: HTMLElement;
  private readonly boxLabel: HTMLElement;
  private highlighted: Element | null = null;
  private readonly reposition = () => this.placeHighlight();

  constructor(options: { storeName: string; domain: string; onStop: () => void }) {
    this.host = document.createElement(HOST_TAG);
    // Closed: the store's scripts get null from host.shadowRoot and can't reach the panel.
    const root = this.host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = STYLES;

    this.panel = el("section", "panel");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Saverlly store setup");
    const top = el("div", "top");
    const store = el("span", "store", `Setting up ${options.storeName} · ${options.domain}`);
    store.title = options.domain;
    const move = el("button", "icon", "⇆");
    move.type = "button";
    move.title = "Move this panel to the other side";
    move.setAttribute("aria-label", "Move this panel to the other side");
    move.addEventListener("click", () => {
      this.panel.dataset.side = this.panel.dataset.side === "left" ? "right" : "left";
    });
    const stop = el("button", "icon", "✕");
    stop.type = "button";
    stop.title = "Stop setup on this page";
    stop.setAttribute("aria-label", "Stop setup on this page");
    stop.addEventListener("click", options.onStop);
    top.append(el("span", "brand", "Saverlly"), store, move, stop);
    this.content = el("div");
    this.content.setAttribute("aria-live", "polite");
    this.panel.append(top, this.content);

    this.box = el("div", "highlight");
    this.boxLabel = el("span", "label");
    this.box.append(this.boxLabel);
    root.append(style, this.box, this.panel);
    for (const type of CONTAINED_EVENTS) this.host.addEventListener(type, (event) => event.stopPropagation());
  }

  mount(): void {
    if (this.host.isConnected) return;
    // On <html>, not <body>: some checkouts replace or re-render <body> wholesale.
    document.documentElement.append(this.host);
    window.addEventListener("scroll", this.reposition, true);
    window.addEventListener("resize", this.reposition);
  }

  destroy(): void {
    window.removeEventListener("scroll", this.reposition, true);
    window.removeEventListener("resize", this.reposition);
    this.host.remove();
  }

  /** True for the panel's host, so pick mode can let the admin use the panel normally. */
  owns(node: EventTarget | null): boolean {
    return node === this.host;
  }

  get mounted(): boolean {
    return this.host.isConnected;
  }

  render(view: OverlayView): void {
    this.panel.dataset.tone = view.tone ?? "info";
    const parts: HTMLElement[] = [];
    if (view.step) parts.push(el("div", "step", `Step ${view.step.index} of ${view.step.total}`));
    parts.push(el("h2", "title", view.title), el("p", "body", view.body));
    if (view.result) parts.push(el("p", "result", view.result));
    if (view.notes?.length) {
      // Lines that carry their own ✓ / ✗ / – need no bullet as well.
      const list = el("ul", view.notes.every((n) => /^[✓✗–]/.test(n)) ? "notes marked" : "notes");
      for (const note of view.notes) list.append(el("li", undefined, note));
      parts.push(list);
    }
    if (view.detail) parts.push(el("p", "detail", view.detail));
    if (view.actions.length) {
      const actions = el("div", "actions");
      for (const action of view.actions) {
        const button = el("button", action.kind, action.label);
        button.type = "button";
        button.dataset.action = action.id;
        button.disabled = !!action.disabled;
        button.addEventListener("click", () => action.onClick());
        actions.append(button);
      }
      parts.push(actions);
    }
    this.content.replaceChildren(...parts);
  }

  /** Outlines `target` (or hides the outline). The label names what it is. */
  highlight(target: Element | null, label?: string, tone: "info" | "error" = "info"): void {
    this.highlighted = target;
    this.boxLabel.textContent = label ?? "";
    this.boxLabel.hidden = !label;
    this.box.dataset.tone = tone;
    this.placeHighlight();
  }

  private placeHighlight(): void {
    const target = this.highlighted;
    if (!target?.isConnected) {
      this.box.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    Object.assign(this.box.style, {
      display: "block",
      top: `${rect.top - 3}px`,
      left: `${rect.left - 3}px`,
      width: `${rect.width + 6}px`,
      height: `${rect.height + 6}px`,
    });
    // Near the top of the viewport the label goes underneath instead of off-screen.
    this.box.toggleAttribute("data-below", rect.top < 28);
  }

  /** For tests: the panel's own tree, which pages can't reach. */
  inspect(): HTMLElement {
    return this.panel;
  }
}
