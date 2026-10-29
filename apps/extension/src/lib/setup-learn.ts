import type { CheckoutRecipe } from "@saverlly/shared-types";
import { CheckoutActions, readTotal, setFieldValue } from "./checkout-actions";
import { element as findElement, isVisible } from "./checkout-dom";
import { isButtonLike } from "./setup-heuristics";

// Learning how a store answers a code: store setup submits a code that can't exist and works
// out which element on the page is the store's "invalid code" message. Ranking is plain,
// testable rules over what appeared or changed after the submission; the admin confirms the
// result before anything is saved.

const SETTLE_QUIET_MS = 700;
const MIN_WAIT_MS = 600;
const MAX_WAIT_MS = 8_000;
const POLL_MS = 100;
const BUTTON_READY_MS = 1_000;
const MAX_MESSAGE_LENGTH = 300;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A code no store will accept, recognisable in logs and on screen. */
export function testCode(random: () => number = Math.random): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(random() * chars.length)];
  return `SAVERLLY-TEST-${suffix}`;
}

const ERROR_NAME = /error|invalid|warning|alert|danger|notice|message|feedback|notification|toast|banner|status/i;
const ERROR_TEXT =
  /invalid|not valid|isn['’]t valid|expired|not found|doesn['’]t exist|does not exist|no longer|unable|can['’]?t be (?:applied|used)|cannot be (?:applied|used)|not (?:applicable|eligible)|enter a valid|try again|unknown|incorrect|not recogni[sz]ed|minimum|isn['’]t available|not available|couldn['’]t|could not/i;

function ownText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function describedByInvalidField(el: Element, field: Element): boolean {
  if (field.getAttribute("aria-invalid") !== "true") return false;
  const ids = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return !!el.id && ids.includes(el.id);
}

/** Score for how likely `el` is the store's rejection message. Higher is likelier; <= 0 never. */
export function scoreMessage(el: Element, field: Element, excluded: Element[]): number {
  if (!el.isConnected || !isVisible(el)) return 0;
  if (excluded.some((x) => x === el || x.contains(el) || el.contains(x))) return 0;
  if (el.contains(field)) return 0; // A container around the promo box, not a message.
  const text = ownText(el);
  if (text.length < 2 || text.length > MAX_MESSAGE_LENGTH) return 0;

  let score = 0;
  if (describedByInvalidField(el, field)) score += 8;
  const live = el.closest('[role="alert"], [role="status"], [aria-live]');
  if (live === el) score += 5;
  else if (live && live.contains(el)) score += 3;
  const name = `${el.id} ${typeof el.className === "string" ? el.className : ""}`;
  if (ERROR_NAME.test(name)) score += 4;
  if (ERROR_TEXT.test(text)) score += 4;
  // Close to the promo box: inside the same few levels of the page.
  let scope: Element | null = field.parentElement;
  for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement)
    if (scope.contains(el)) {
      score += 3 - Math.min(depth, 2);
      break;
    }
  return score;
}

/** Candidates ordered best first; only those with a real signal (score >= 4) qualify. */
export function rankMessages(
  candidates: Iterable<Element> | ArrayLike<Element>,
  field: Element,
  excluded: Element[],
): Element[] {
  const scored = new Map<Element, number>();
  for (const el of Array.from(candidates)) {
    const score = scoreMessage(el, field, excluded);
    if (score >= 4) scored.set(el, score);
  }
  return [...scored.entries()]
    .sort(([a, sa], [b, sb]) => {
      if (sb !== sa) return sb - sa;
      // Equal evidence: the innermost element, which is the message rather than its wrapper.
      return a.contains(b) ? 1 : b.contains(a) ? -1 : 0;
    })
    .map(([el]) => el);
}

/** Elements worth considering on a page with no before/after to compare (after a reload). */
export function scanForMessages(root: ParentNode = document): Element[] {
  return Array.from(
    root.querySelectorAll('[role="alert"], [role="status"], [aria-live], [class*="error" i], [class*="invalid" i], [class*="notice" i], [class*="message" i], [id*="error" i], li, p, span, div, small, strong'),
  );
}

/** Collects every element that appeared, changed text, or changed visibility. */
export function watchChanges(root: Element = document.documentElement) {
  const changed = new Set<Element>();
  let lastChangeAt = 0;
  const note = (node: Node | null) => {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return;
    changed.add(el);
    for (const child of Array.from(el.querySelectorAll("*")).slice(0, 50)) changed.add(child);
    for (let up = el.parentElement, i = 0; up && i < 2; up = up.parentElement, i++) changed.add(up);
  };
  const observer = new MutationObserver((records) => {
    lastChangeAt = Date.now();
    for (const record of records) {
      if (record.type === "childList") record.addedNodes.forEach(note);
      else note(record.target);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "style", "class", "aria-hidden", "aria-invalid", "aria-describedby"],
  });
  return {
    changed,
    lastChangeAt: () => lastChangeAt,
    stop: () => observer.disconnect(),
  };
}

export type TestCodeOutcome =
  | { kind: "answered"; candidates: Element[] }
  /** The store accepted the made-up code: something is badly wrong with the picks. */
  | { kind: "accepted" }
  | { kind: "no-field" }
  | { kind: "button-disabled" };

/**
 * Submits `code` through the picked promo box and apply button, the way shoppers' codes are,
 * and returns what appeared in answer, best guess first. The code is left in the box: clearing
 * it now would make many stores hide the very message the admin is about to confirm. Call
 * clearTestCode once the step is done.
 */
export async function submitTestCode(
  recipe: CheckoutRecipe,
  code: string,
  checkActive: () => void,
): Promise<TestCodeOutcome> {
  try {
    await new CheckoutActions(recipe, checkActive).reveal();
  } catch {
    return { kind: "no-field" };
  }
  const field = findElement<HTMLInputElement>(recipe.couponFieldSelector);
  if (!field) return { kind: "no-field" };
  const before = readTotal(recipe.cartTotalSelector);
  setFieldValue(field, code);
  // Controlled forms enable Apply only after the input event: wait only as long as that takes.
  const ready = Date.now() + BUTTON_READY_MS;
  let button = findElement<HTMLButtonElement>(recipe.applyButtonSelector);
  while ((!button || button.disabled || button.getAttribute("aria-disabled") === "true") && Date.now() < ready) {
    await sleep(50);
    checkActive();
    button = findElement<HTMLButtonElement>(recipe.applyButtonSelector);
  }
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
    setFieldValue(field, "");
    return { kind: "button-disabled" };
  }

  const watch = watchChanges();
  const started = Date.now();
  try {
    button.click();
    for (;;) {
      await sleep(POLL_MS);
      checkActive();
      const now = Date.now();
      const quiet = now - Math.max(watch.lastChangeAt(), started) >= SETTLE_QUIET_MS;
      const seen = rankMessages(watch.changed, field, []).length > 0;
      if (now - started >= MIN_WAIT_MS && quiet && seen) break;
      if (now - started >= MAX_WAIT_MS) break;
    }
  } finally {
    watch.stop();
  }

  const after = readTotal(recipe.cartTotalSelector);
  if (before !== null && after !== null && Math.round(after * 100) < Math.round(before * 100))
    return { kind: "accepted" };
  const excluded = [field, button, findElement(recipe.cartTotalSelector)].filter((x): x is HTMLElement => !!x);
  const candidates = rankMessages(watch.changed, findElement(recipe.couponFieldSelector) ?? field, excluded);
  return { kind: "answered", candidates };
}

/** Empties the promo box if it still holds `code`, leaving any shopper's own entry alone. */
export function clearTestCode(couponFieldSelector: string, code: string): void {
  const field = findElement<HTMLInputElement>(couponFieldSelector);
  if (field && field.value.trim() === code) setFieldValue(field, "");
}

// ---- A real code the admin applied: its success message and its remove control -------------

const SUCCESS_NAME = /success|applied|discount|saving|valid|confirm|tag|chip|badge|reduction|coupon|promo|voucher/i;
const SUCCESS_TEXT =
  /applied|saved|you save|savings|discount|\d+\s?% off|off your|success|accepted|activated|added|reduction|redeemed/i;

function includesCode(text: string, code: string | undefined): boolean {
  return !!code && code.length >= 3 && text.toLowerCase().includes(code.toLowerCase());
}

/** Score for how likely `el` shows that a code was applied. Higher is likelier; <= 0 never. */
export function scoreSuccess(el: Element, field: Element | null, excluded: Element[], code?: string): number {
  if (!el.isConnected || !isVisible(el)) return 0;
  if (excluded.some((x) => x === el || x.contains(el) || el.contains(x))) return 0;
  if ((field && el.contains(field)) || isButtonLike(el)) return 0;
  const text = ownText(el);
  if (text.length < 2 || text.length > MAX_MESSAGE_LENGTH) return 0;

  let score = 0;
  // A chip or line naming the code ("SAVE10 −$10.00") is the clearest sign there is.
  if (includesCode(text, code)) score += 5;
  const live = el.closest('[role="alert"], [role="status"], [aria-live]');
  if (live === el) score += 3;
  else if (live && live.contains(el)) score += 2;
  const name = `${el.id} ${typeof el.className === "string" ? el.className : ""}`;
  if (SUCCESS_NAME.test(name)) score += 3;
  if (SUCCESS_TEXT.test(text)) score += 3;
  if (ERROR_TEXT.test(text) && !SUCCESS_TEXT.test(text)) score -= 6;
  // Near the promo box, when it is still on the page (many stores remove it once a code applies).
  let scope: Element | null = field?.parentElement ?? null;
  for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement)
    if (scope.contains(el)) {
      score += 2 - Math.min(depth, 2);
      break;
    }
  return score;
}

/** Elements showing the code was applied, best first; only those with a real signal. */
export function rankSuccess(
  candidates: Iterable<Element> | ArrayLike<Element>,
  field: Element | null,
  excluded: Element[],
  code?: string,
): Element[] {
  const scored = new Map<Element, number>();
  for (const el of Array.from(candidates)) {
    const score = scoreSuccess(el, field, excluded, code);
    if (score >= 4) scored.set(el, score);
  }
  return [...scored.entries()]
    .sort(([a, sa], [b, sb]) => (sb !== sa ? sb - sa : a.contains(b) ? 1 : b.contains(a) ? -1 : 0))
    .map(([el]) => el);
}

const REMOVE_WORDS = /\b(?:remove|delete|clear)\b/i;
const REMOVE_SYMBOL = /^[×✕✖x]$/i;

function controlLabel(el: Element): string {
  return (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Score for how likely `el` removes the applied code. Higher is likelier; <= 0 never. */
export function scoreRemove(el: Element, excluded: Element[], code?: string): number {
  if (!el.isConnected || !isVisible(el) || !isButtonLike(el)) return 0;
  if (excluded.some((x) => x === el || x.contains(el))) return 0;
  const label = controlLabel(el);
  let score = 0;
  if (REMOVE_WORDS.test(label)) score += 5;
  else if (REMOVE_SYMBOL.test(label)) score += 3;
  else return 0;
  if (includesCode(label, code)) score += 3;
  // Sitting in the chip that names the code: a small holder, not a page section that merely
  // contains the chip somewhere.
  const holder = el.parentElement;
  const holderText =
    holder && holder !== document.body && holder !== document.documentElement ? ownText(holder) : "";
  if (holderText.length <= 80 && includesCode(holderText, code)) score += 2;
  return score;
}

export function rankRemove(
  candidates: Iterable<Element> | ArrayLike<Element>,
  excluded: Element[],
  code?: string,
): Element[] {
  const scored = new Map<Element, number>();
  for (const el of Array.from(candidates)) {
    const score = scoreRemove(el, excluded, code);
    if (score >= 5) scored.set(el, score);
  }
  return [...scored.entries()].sort(([, a], [, b]) => b - a).map(([el]) => el);
}

/** Every control on the page that could remove a code: for after a reload, or a remove link
 *  that was already in the page and only became visible. */
export function scanForControls(root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll('button, a[href], [role="button"], input[type="button"], input[type="submit"]'));
}

/** Resolves once the page has been quiet for a moment (or after `maxMs`). */
export async function settle(
  watch: ReturnType<typeof watchChanges>,
  checkActive: () => void,
  { minMs = MIN_WAIT_MS, maxMs = 5_000 } = {},
): Promise<void> {
  const started = Date.now();
  for (;;) {
    await sleep(POLL_MS);
    checkActive();
    const now = Date.now();
    if (now - started >= minMs && now - Math.max(watch.lastChangeAt(), started) >= SETTLE_QUIET_MS) return;
    if (now - started >= maxMs) return;
  }
}

/**
 * Remembers what the admin types into the promo box. Many stores empty the box once a code is
 * accepted (Shopify moves it into a chip), so the value is captured as it is typed.
 */
export function watchTypedCode(couponFieldSelector: string, onCode: (code: string) => void) {
  let last = "";
  const onInput = (event: Event) => {
    const field = findElement(couponFieldSelector);
    if (!field || event.target !== field) return;
    const value = (field as HTMLInputElement).value.trim();
    if (value && value !== last) {
      last = value;
      onCode(value);
    }
  };
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  return {
    current: () => last,
    stop: () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    },
  };
}
