import { normalizeCheckoutSelector } from "@saverlly/shared-types";
import { isVisible } from "./checkout-dom";

// Builds the CSS selector a recipe stores for an element an admin clicked during store setup.
// A recipe must keep working for every shopper on later visits, after the store re-renders,
// so the selector is built from what is stable about the element (test ids, names, labels,
// meaningful classes) rather than from where it happens to sit in today's page.
//
// Output grammar is deliberately small: tag, #id, .class, [attr="value"], :nth-of-type(n),
// and the descendant/child combinators. Every form passes the backend's isCssSelector check
// and is left unchanged by normalizeCheckoutSelector.

/** How a selector was found; "template" = taken from the store platform's template (setup-template). */
export type SelectorStrategy = "id" | "attribute" | "class" | "scoped" | "path" | "template";

export type SelectorResult =
  | {
      ok: true;
      selector: string;
      strategy: SelectorStrategy;
      /** False when the selector also matches hidden copies (e.g. a mobile-only duplicate).
       *  The extension always acts on the visible match, so this is still usable. */
      exact: boolean;
    }
  | { ok: false; reason: "shadow-root" | "detached" | "not-unique" };

// Attributes worth targeting, most deliberate first. Test hooks are added by developers
// precisely so automation can find an element, and rarely change in a redesign.
const PRIORITY_ATTRIBUTES = [
  "data-testid",
  "data-test-id",
  "data-test",
  "data-qa",
  "data-cy",
  "data-automation-id",
  "data-hook",
  "name",
  "aria-label",
  "placeholder",
  "title",
  "for",
];
// data-* attributes that hold framework state or render bookkeeping, not identity.
const VOLATILE_DATA_ATTRIBUTE =
  /^data-(?:v-|reactid|react|rbd|radix|state|headlessui|orientation|side|align|active|selected|focus|hover|disabled|loading|open|checked|value|index|key|id$|uid|guid|aos|gtm|ga|analytics|track)/;
// Classes that describe a momentary state; selecting on them breaks as soon as it changes.
const STATE_CLASS =
  /^(?:is-|has-)?(?:active|focus|focused|focus-visible|hover|hovered|selected|open|opened|closed|disabled|enabled|visible|hidden|loading|loaded|error|errors|invalid|valid|dirty|touched|pristine|empty|filled|checked|expanded|collapsed|show|showing|current)$|^ng-|^js-focus/;
// CSS-in-JS, CSS-module and atomic-CSS output, regenerated on every build: "css-1x9fk2",
// "sc-bdVaJa", "Button_root__3xQ2a", "jsx-2738", Shopify's "_1m2hr9ge".
const HASHED_CLASS =
  /^(?:css|sc|jsx|jss|emotion|styled|chakra|svelte|astro)-[\w-]*?(?:\d|[A-Z])|_{1,2}(?=[a-zA-Z0-9-]*\d)[a-zA-Z0-9-]{5,10}$/;
// Tailwind-style utilities say how an element looks, not what it is ("p-4", "text-sm",
// "md:flex"). Semantic classes that merely share a prefix ("text-field") are kept.
const UTILITY_CLASS =
  /:|^-?[mp][trblxy]?-(?:\d|px|auto)|^(?:w|h|min-w|max-w|min-h|max-h|gap|gap-[xy]|z|opacity|top|left|right|bottom|inset|order|basis|grow|shrink|col-span|row-span|space-[xy]|leading|tracking|duration|delay|scale|rotate|translate-[xy])-|^(?:flex|grid|block|inline-block|inline-flex|inline|hidden|absolute|relative|fixed|sticky|static|truncate|uppercase|lowercase|capitalize|underline|italic|sr-only|shadow|rounded|border|ring|transition|container|grow|shrink)$|^(?:text|bg|border|ring|font|rounded|shadow|items|justify|self|place|cursor|select|pointer-events|overflow|object|align)-(?:[a-z]+-)?(?:\d+|xs|sm|md|lg|xl|\dxl|full|none|auto|left|right|center|start|end|between|around|evenly|stretch|baseline|bold|semibold|medium|normal|light|thin|white|black|transparent|current|hidden|visible|scroll|clip|pointer|default|inherit|cover|contain)$/;

const MAX_VALUE_LENGTH = 80;
const MAX_ANCESTOR_DEPTH = 6;

/**
 * True for a value that looks generated rather than written by a developer: React useId,
 * UUIDs, hex hashes, long numbers, mixed-case hashes. With `counters`, also a trailing index
 * ("TextField12", "input0"), which ids and classes get from list rendering but form field
 * names legitimately carry ("address1").
 */
export function looksGenerated(value: string, { counters = true } = {}): boolean {
  if (!value || value.length > MAX_VALUE_LENGTH || /\s/.test(value)) return true;
  const hexHash = /^[0-9a-f_-]{6,}$/i.test(value) && /\d/.test(value) && /[a-f]/i.test(value);
  const upper = value.match(/[A-Z]/g)?.length ?? 0;
  const mixedCaseHash =
    /^[A-Za-z]{5,8}$/.test(value) && upper >= 3 && !/^[A-Z]?[a-z]+(?:[A-Z][a-z]+)*$/.test(value);
  return (
    /^:|:$/.test(value) || // React useId (":r3:")
    /^(?:ember|ext-gen|yui_|uid-|ui-id-|react-|radix-|headlessui-|mui-|mantine-|chakra-|downshift-|rc_|__)/i.test(value) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value) ||
    /\d{3,}/.test(value) ||
    hexHash ||
    mixedCaseHash ||
    (counters && /[a-z_-]\d{1,2}$/i.test(value))
  );
}

function isStableClass(name: string): boolean {
  return !STATE_CLASS.test(name) && !HASHED_CLASS.test(name) && !UTILITY_CLASS.test(name) && !looksGenerated(name);
}

export interface SelectorOptions {
  /** Text that is only on the page because of this setup run, such as the codes the admin
   *  entered. An attribute containing it ("Remove SAVE10") would stop matching for shoppers. */
  volatileText?: string[];
}

/** Simple CSS identifiers only; anything else is written as an attribute selector instead. */
const SAFE_IDENTIFIER = /^[A-Za-z_][\w-]*$/;

/** [attr="value"] for values that need no escaping, so the selector round-trips unchanged
 *  through normalizeCheckoutSelector and every selector parser. */
function attributeSelector(name: string, value: string): string | null {
  if (!value.trim() || value.length > MAX_VALUE_LENGTH || /["\\\n\r]/.test(value)) return null;
  return `[${name}="${value}"]`;
}

function tagName(el: Element): string {
  return el.localName;
}

function idSelector(el: Element): string | null {
  const id = el.getAttribute("id");
  if (!id || looksGenerated(id)) return null;
  return SAFE_IDENTIFIER.test(id) ? `#${id}` : attributeSelector("id", id);
}

// Shown to people, so translated: a store served in another language renders other text.
const WORDY_ATTRIBUTES = new Set(["aria-label", "placeholder", "title"]);

/** Attribute selectors for el, split into language-neutral identifiers and translated words. */
function attributeCandidates(el: Element, volatileText: string[]): { neutral: string[]; wordy: string[] } {
  const tag = tagName(el);
  const names = [
    ...PRIORITY_ATTRIBUTES,
    ...Array.from(el.attributes)
      .map((attr) => attr.name)
      .filter((name) => name.startsWith("data-") && !PRIORITY_ATTRIBUTES.includes(name) && !VOLATILE_DATA_ATTRIBUTE.test(name)),
  ];
  const neutral: string[] = [];
  const wordyCandidates: string[] = [];
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    const wordy = WORDY_ATTRIBUTES.has(name);
    const lower = value.toLowerCase();
    if (volatileText.some((text) => text && lower.includes(text.toLowerCase()))) continue;
    // Words never carry digits or prices unless they describe this cart ("Remove SAVE10",
    // "Total $84.20"); identifiers may, as long as they aren't generated.
    if (wordy ? /[\d$€£¥]/.test(value) : looksGenerated(value, { counters: false })) continue;
    const selector = attributeSelector(name, value);
    if (selector) (wordy ? wordyCandidates : neutral).push(`${tag}${selector}`);
  }
  // Two attributes together can be unique when neither is alone (name + type on a form).
  const type = el.getAttribute("type");
  const withType = (list: string[]) =>
    type && SAFE_IDENTIFIER.test(type) ? [...list, ...list.map((s) => `${s}[type="${type}"]`)] : list;
  return { neutral: withType(neutral), wordy: withType(wordyCandidates) };
}

function classCandidates(el: Element): string[] {
  const tag = tagName(el);
  const classes = Array.from(el.classList).filter((name) => SAFE_IDENTIFIER.test(name) && isStableClass(name));
  const candidates = classes.map((name) => `${tag}.${name}`);
  for (let i = 0; i < classes.length; i++)
    for (let j = i + 1; j < classes.length; j++) candidates.push(`${tag}.${classes[i]}.${classes[j]}`);
  return candidates;
}

type Candidate = { selector: string; strategy: SelectorStrategy };

/**
 * Every stable way to name this element on its own, in ranked groups: language-neutral
 * identifiers (id, test hooks, name), then classes, then translated labels. Within a group the
 * caller prefers an exact match over one that only excludes hidden copies; across groups,
 * rank wins, so a visible-unique `name` beats an exact but translatable `aria-label`.
 */
function ownCandidateGroups(el: Element, volatileText: string[]): Candidate[][] {
  const id = idSelector(el);
  const { neutral, wordy } = attributeCandidates(el, volatileText);
  return [
    [
      ...(id ? [{ selector: id, strategy: "id" as const }] : []),
      ...neutral.map((selector) => ({ selector, strategy: "attribute" as const })),
    ],
    classCandidates(el).map((selector) => ({ selector, strategy: "class" as const })),
    wordy.map((selector) => ({ selector, strategy: "attribute" as const })),
  ];
}

function ownCandidates(el: Element, volatileText: string[]): Candidate[] {
  return ownCandidateGroups(el, volatileText).flat();
}

function matches(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

type Uniqueness = "exact" | "visible" | null;

function uniqueness(doc: Document, selector: string, target: Element): Uniqueness {
  // Anything the shared normalizer would rewrite could reach shoppers in a different form.
  if (normalizeCheckoutSelector(selector) !== selector) return null;
  const found = matches(doc, selector);
  if (!found.includes(target)) return null;
  if (found.length === 1) return "exact";
  const visible = found.filter(isVisible);
  return visible.length === 1 && visible[0] === target ? "visible" : null;
}

/** tag:nth-of-type(n), or just tag when it is the only one of its kind among its siblings. */
function positional(el: Element): string {
  const tag = tagName(el);
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((child) => child.localName === el.localName);
  return sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

export function generateSelector(target: Element, { volatileText = [] }: SelectorOptions = {}): SelectorResult {
  const doc = target.ownerDocument;
  if (!target.isConnected) return { ok: false, reason: "detached" };
  // A selector can't reach into a web component's shadow tree.
  if (target.getRootNode() !== doc) return { ok: false, reason: "shadow-root" };

  // 1. The element alone, by rank group; within a group exact beats visible-only.
  const groups = ownCandidateGroups(target, volatileText);
  for (const group of groups)
    for (const wanted of ["exact", "visible"] as const)
      for (const candidate of group)
        if (uniqueness(doc, candidate.selector, target) === wanted)
          return { ok: true, ...candidate, exact: wanted === "exact" };
  const own = groups.flat();

  // 2. Scoped under the nearest ancestor that can be named on its own: "#promo-form button".
  const targetParts = [...own.map((c) => c.selector), tagName(target)];
  let ancestor = target.parentElement;
  for (let depth = 0; ancestor && ancestor !== doc.body && depth < MAX_ANCESTOR_DEPTH; depth++, ancestor = ancestor.parentElement) {
    const anchors = ownCandidates(ancestor, volatileText).filter((c) => uniqueness(doc, c.selector, ancestor!) !== null);
    for (const wanted of ["exact", "visible"] as const)
      for (const anchor of anchors)
        for (const part of targetParts) {
          const selector = `${anchor.selector} ${part}`;
          if (uniqueness(doc, selector, target) === wanted)
            return { ok: true, selector, strategy: "scoped", exact: wanted === "exact" };
        }
  }

  // 3. Last resort: a child path from the nearest nameable ancestor, or from body.
  const steps: string[] = [];
  let node: Element | null = target;
  while (node && node !== doc.body && node !== doc.documentElement) {
    const anchor = node === target ? null : ownCandidates(node, volatileText).find((c) => uniqueness(doc, c.selector, node!) === "exact");
    if (anchor) {
      steps.unshift(anchor.selector);
      break;
    }
    steps.unshift(positional(node));
    node = node.parentElement;
  }
  if (node === doc.body || node === doc.documentElement || !node) steps.unshift("body");
  const selector = steps.join(" > ");
  const found = uniqueness(doc, selector, target);
  return found
    ? { ok: true, selector, strategy: "path", exact: found === "exact" }
    : { ok: false, reason: "not-unique" };
}
