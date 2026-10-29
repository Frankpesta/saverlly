import type {
  CheckoutRecipe,
  StoreSetupTestResult,
  SubmitStoreSetupRecipePayload,
} from "@saverlly/shared-types";
import { CheckoutActions, cents, readTotal } from "./checkout-actions";
import { element as findElement } from "./checkout-dom";
import { generateSelector, type SelectorStrategy } from "./selector-generator";
import {
  isButtonLike,
  isRevealControl,
  isTextField,
  promoFieldFor,
  suggestApplyButton,
} from "./setup-heuristics";
import type { OverlayAction, SetupOverlay } from "./setup-overlay";
import { actionable, clickPastPicker, pick, type PickOutcome } from "./setup-picker";
import {
  clearTestCode,
  rankMessages,
  rankRemove,
  rankSuccess,
  scanForControls,
  scanForMessages,
  settle,
  submitTestCode,
  testCode,
  watchChanges,
  watchTypedCode,
  type TestCodeOutcome,
} from "./setup-learn";
import { buildRecipe, CHECK_LABELS, runFinalTest } from "./setup-test";
import type { StoreSetupSubmitResult } from "./messages";
import { checkoutUrlPattern } from "./url-pattern";

// The guided steps of point-and-click store setup, run by the setup content script on the
// store's checkout. Each step renders into the panel and resolves to where to go next; the
// admin's choices are kept in SetupProgress, saved after every change so a reload or a new
// page on the store carries on from the same step.

export interface PickedElement {
  selector: string;
  strategy: SelectorStrategy;
  /** False when the selector also matches hidden copies (still usable; see SelectorResult). */
  exact: boolean;
}

export type PickKey =
  | "revealLink"
  | "promoField"
  | "applyButton"
  | "cartTotal"
  | "failureMessage"
  | "successMessage"
  | "removeControl";

export interface SetupProgress {
  version: 2;
  /** Index into SETUP_STEPS of the step on screen. */
  step: number;
  /** The recipe's checkout URL pattern, from the page the admin confirmed as the checkout. */
  pattern?: string;
  /** Whether the promo box shows straight away or only after clicking a link. */
  reveal?: "visible" | "link";
  /** The admin chose to go on although the store showed no message for a rejected code. */
  noFailureMessage?: boolean;
  /** A test code submitted just now. Set before submitting, so if the store reloads the page
   *  to show its answer, the step can look for the message on the new page. */
  pendingTest?: { code: string; at: number };
  /** The optional working-code step: skipped, or done (its findings are in picks/applyMode). */
  realCode?: "skipped" | "done";
  /** Set only once removing a code was seen to restore the total: compare by removing each
   *  code before the next. Never guessed; without it the store gets one working code. */
  applyMode?: "remove";
  /** The admin's code is still applied in their cart (it couldn't be removed for them). */
  codeStillApplied?: boolean;
  /** The admin is applying a working code: the total before, and the code as typed. Survives
   *  a store reloading the page on Apply. */
  pendingReal?: { before: number; at: number; code?: string };
  /** Set while the final test submits its code: if the store reloads then, the test says so. */
  pendingFinal?: { at: number };
  /** The draft has been sent to the dashboard. */
  submitted?: boolean;
  picks: Partial<Record<PickKey, PickedElement>>;
}

export interface FlowEnv {
  overlay: SetupOverlay;
  storeName: string;
  domain: string;
  progress: SetupProgress;
  save: (progress: SetupProgress) => Promise<void>;
  /** Sends the draft to the dashboard through the service worker. */
  submit: (payload: SubmitStoreSetupRecipePayload) => Promise<StoreSetupSubmitResult>;
  /** Ends setup on this page, as the panel's ✕ does. */
  stop: () => void;
  signal: AbortSignal;
}

type StepResult = "next" | "back";
interface Step {
  run: (env: FlowEnv) => Promise<StepResult>;
}

export function initialProgress(): SetupProgress {
  return { version: 2, step: 0, picks: {} };
}

const PICK_KEYS: PickKey[] = [
  "revealLink",
  "promoField",
  "applyButton",
  "cartTotal",
  "failureMessage",
  "successMessage",
  "removeControl",
];

function isPicked(value: unknown): value is PickedElement {
  const pick = value as Partial<PickedElement> | null;
  return !!pick && typeof pick.selector === "string" && typeof pick.strategy === "string" && typeof pick.exact === "boolean";
}

/** Accepts saved progress only in the exact shape this version writes; anything else
 *  (an older build, a corrupted record) starts over rather than resuming wrongly. */
export function parseProgress(value: unknown): SetupProgress {
  const progress = value as Partial<SetupProgress> | null;
  if (
    !progress ||
    progress.version !== 2 ||
    !Number.isInteger(progress.step) ||
    progress.step! < 0 ||
    progress.step! >= SETUP_STEPS.length ||
    typeof progress.picks !== "object" ||
    progress.picks === null ||
    (progress.pattern !== undefined && typeof progress.pattern !== "string") ||
    (progress.reveal !== undefined && progress.reveal !== "visible" && progress.reveal !== "link") ||
    (progress.noFailureMessage !== undefined && typeof progress.noFailureMessage !== "boolean") ||
    (progress.pendingTest !== undefined &&
      (typeof progress.pendingTest?.code !== "string" || typeof progress.pendingTest?.at !== "number")) ||
    (progress.realCode !== undefined && progress.realCode !== "skipped" && progress.realCode !== "done") ||
    (progress.applyMode !== undefined && progress.applyMode !== "remove") ||
    (progress.codeStillApplied !== undefined && typeof progress.codeStillApplied !== "boolean") ||
    (progress.pendingFinal !== undefined && typeof progress.pendingFinal?.at !== "number") ||
    (progress.submitted !== undefined && typeof progress.submitted !== "boolean") ||
    (progress.pendingReal !== undefined &&
      (typeof progress.pendingReal?.before !== "number" ||
        typeof progress.pendingReal?.at !== "number" ||
        (progress.pendingReal.code !== undefined && typeof progress.pendingReal.code !== "string"))) ||
    Object.entries(progress.picks).some(([key, pick]) => !PICK_KEYS.includes(key as PickKey) || !isPicked(pick))
  )
    return initialProgress();
  return {
    version: 2,
    step: progress.step!,
    pattern: progress.pattern,
    reveal: progress.reveal,
    noFailureMessage: progress.noFailureMessage,
    pendingTest: progress.pendingTest,
    realCode: progress.realCode,
    applyMode: progress.applyMode,
    codeStillApplied: progress.codeStillApplied,
    pendingReal: progress.pendingReal,
    pendingFinal: progress.pendingFinal,
    submitted: progress.submitted,
    picks: { ...progress.picks },
  };
}

const UNSUPPORTED: Record<"frame" | "shadow-root", string> = {
  frame:
    "That part of the checkout is inside a separate frame, often a payment provider's. Saverlly can only work with the store's own page, so if the promo box is in there, this store can't be set up automatically.",
  "shadow-root":
    "That part of the page is built in a way Saverlly can't reach. Try clicking the item itself, or a part of the checkout just around it.",
};

const NOT_RECOGNISABLE =
  "Saverlly couldn't find a reliable way to recognise that. Click it again, right on the item itself.";

const stopped = () => new DOMException("Setup stopped", "AbortError");

/** Waits for the admin to press one of the panel's buttons. */
function choose(env: FlowEnv, render: (on: (id: string) => () => void) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(stopped());
    if (env.signal.aborted) return onAbort();
    env.signal.addEventListener("abort", onAbort, { once: true });
    render((id) => () => {
      env.signal.removeEventListener("abort", onAbort);
      resolve(id);
    });
  });
}

/** The element a saved pick points at on this page, if it is here. */
function located(env: FlowEnv, key: PickKey): HTMLElement | null {
  const saved = env.progress.picks[key];
  return saved ? findElement(saved.selector) : null;
}

interface PickStepOptions {
  key: PickKey;
  index: number;
  title: string;
  body: string;
  /** Outline label while hovering and when confirming. */
  label: string;
  /** Shown once chosen ("Promo code box selected."). */
  found: (element: Element | null) => string;
  passThrough?: boolean;
  resolve?: (target: Element) => Element | null;
  /** Why this element is the wrong kind of thing, if it is. */
  checkElement?: (element: Element) => string | null;
  /** Why the selector for it won't work, if it won't. */
  checkSelector?: (selector: string) => string | null;
  /** A likely candidate to offer before asking the admin to click. */
  suggest?: () => Element | null;
  /** Extra panel buttons while choosing ("Open the promo box"). */
  helpers?: () => OverlayAction[];
  /** Text only on the page because of this run (a test code); never part of a selector. */
  volatileText?: () => string[];
}

/** Turns a clicked element into a saved pick, or explains why it can't be one. */
function toPick(element: Element, options: PickStepOptions): { pick: PickedElement } | { problem: string } {
  const wrongKind = options.checkElement?.(element);
  if (wrongKind) return { problem: wrongKind };
  const generated = generateSelector(element, { volatileText: options.volatileText?.() ?? [] });
  if (!generated.ok)
    return { problem: generated.reason === "detached" ? "The page changed while you clicked. Try again." : NOT_RECOGNISABLE };
  // The lookup the shopper's coupon run uses has to land on this very element.
  if (findElement(generated.selector) !== element) return { problem: NOT_RECOGNISABLE };
  const unusable = options.checkSelector?.(generated.selector);
  if (unusable) return { problem: unusable };
  return { pick: { selector: generated.selector, strategy: generated.strategy, exact: generated.exact } };
}

/**
 * One "click this part of the checkout" step: an optional suggestion, then pick mode, then a
 * confirmation the admin can accept, redo or go back from. Unusable picks say why and retry.
 */
async function pickStep(env: FlowEnv, options: PickStepOptions): Promise<StepResult> {
  const step = { index: options.index, total: COUNTED_STEPS };
  let problem: string | undefined;
  let suggestionDeclined = false;
  const keep = async (pick: PickedElement) => {
    env.progress.picks[options.key] = pick;
    await env.save(env.progress);
    problem = undefined;
  };

  for (;;) {
    const existing = env.progress.picks[options.key];
    if (existing && !problem) {
      const target = located(env, options.key);
      env.overlay.highlight(target, options.label);
      const choice = await choose(env, (on) =>
        env.overlay.render({
          step,
          title: options.title,
          body: options.body,
          result: options.found(target),
          detail: existing.selector,
          actions: [
            { id: "next", label: "Continue", kind: "primary", onClick: on("next") },
            { id: "redo", label: "Choose again", kind: "secondary", onClick: on("redo") },
            { id: "back", label: "Back", kind: "link", onClick: on("back") },
          ],
        }),
      );
      env.overlay.highlight(null);
      if (choice === "next" || choice === "back") return choice;
      delete env.progress.picks[options.key];
      suggestionDeclined = true;
      await env.save(env.progress);
      continue;
    }

    const suggestion = !suggestionDeclined && !problem ? options.suggest?.() ?? null : null;
    if (suggestion) {
      env.overlay.highlight(suggestion, `${options.label}?`);
      const choice = await choose(env, (on) =>
        env.overlay.render({
          step,
          title: options.title,
          body: `Is the outlined item the ${options.label.toLowerCase()}?`,
          actions: [
            { id: "yes", label: "Yes, that's it", kind: "primary", onClick: on("yes") },
            { id: "no", label: "No, I'll choose", kind: "secondary", onClick: on("no") },
            { id: "back", label: "Back", kind: "link", onClick: on("back") },
          ],
        }),
      );
      env.overlay.highlight(null);
      if (choice === "back") return "back";
      suggestionDeclined = true;
      if (choice === "yes") {
        const outcome = toPick(suggestion, options);
        if ("pick" in outcome) await keep(outcome.pick);
        else problem = outcome.problem;
      }
      continue;
    }

    const controller = new AbortController();
    const stopPick = () => controller.abort();
    env.signal.addEventListener("abort", stopPick, { once: true });
    let backRequested = false;
    env.overlay.render({
      step,
      title: options.title,
      body: `${options.body} Press Esc to stop choosing.`,
      result: problem,
      tone: problem ? "error" : "info",
      actions: [
        ...(options.helpers?.() ?? []),
        {
          id: "back",
          label: "Back",
          kind: "link",
          onClick: () => {
            backRequested = true;
            controller.abort();
          },
        },
      ],
    });
    let outcome: PickOutcome;
    try {
      outcome = await pick({
        overlay: env.overlay,
        label: options.label,
        passThrough: options.passThrough,
        resolve: options.resolve ?? actionable,
        signal: controller.signal,
      });
    } finally {
      env.signal.removeEventListener("abort", stopPick);
    }
    if (env.signal.aborted) throw stopped();
    if (backRequested) return "back";
    if (outcome.kind === "cancelled") {
      problem = "Stopped choosing. Click the item on the checkout when you're ready.";
      continue;
    }
    if (outcome.kind === "unsupported") {
      problem = UNSUPPORTED[outcome.reason];
      continue;
    }
    const result = toPick(outcome.element, options);
    if ("pick" in result) await keep(result.pick);
    else problem = result.problem;
  }
}

/** Counted guided steps, for "Step n of m". */
const COUNTED_STEPS = 8;

const checkoutPageStep: Step = {
  run: async (env) => {
    for (;;) {
      const result = checkoutUrlPattern(location.href);
      if (!result.ok) {
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step: { index: 1, total: COUNTED_STEPS },
            title: "Open the checkout page",
            body: "This page's address is too general to recognise as the checkout. Go to the page where shoppers enter a promo code, then check again.",
            tone: "error",
            result: "Not a checkout address.",
            detail: location.pathname,
            actions: [
              { id: "retry", label: "Check again", kind: "primary", onClick: on("retry") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice === "back") return "back";
        continue;
      }
      const choice = await choose(env, (on) =>
        env.overlay.render({
          step: { index: 1, total: COUNTED_STEPS },
          title: "Is this the checkout page?",
          body: "This should be the page where shoppers enter a promo code. Saverlly will look for the promo box on pages like it.",
          result: `Pages whose address contains ${result.pattern}`,
          detail: location.pathname,
          actions: [
            { id: "next", label: "Yes, this is it", kind: "primary", onClick: on("next") },
            { id: "retry", label: "Check again", kind: "secondary", onClick: on("retry") },
            { id: "back", label: "Back", kind: "link", onClick: on("back") },
          ],
        }),
      );
      if (choice === "back") return "back";
      if (choice === "retry") continue;
      env.progress.pattern = result.pattern;
      await env.save(env.progress);
      return "next";
    }
  },
};

const revealStep: Step = {
  run: async (env) => {
    for (;;) {
      const current =
        env.progress.reveal === "link"
          ? "Currently: the box opens from a link."
          : env.progress.reveal === "visible"
            ? "Currently: the box is visible."
            : undefined;
      const choice = await choose(env, (on) =>
        env.overlay.render({
          step: { index: 2, total: COUNTED_STEPS },
          title: "Can you see the promo code box?",
          body: "On some checkouts it only appears after clicking a link like \"Have a promo code?\".",
          result: current,
          actions: [
            { id: "visible", label: "Yes, I can see it", kind: "primary", onClick: on("visible") },
            { id: "link", label: "It's behind a link", kind: "secondary", onClick: on("link") },
            { id: "back", label: "Back", kind: "link", onClick: on("back") },
          ],
        }),
      );
      if (choice === "back") return "back";
      if (choice === "visible") {
        env.progress.reveal = "visible";
        delete env.progress.picks.revealLink;
        await env.save(env.progress);
        return "next";
      }
      env.progress.reveal = "link";
      await env.save(env.progress);
      const picked = await pickStep(env, {
        key: "revealLink",
        index: 2,
        title: "Click the link that opens the promo box",
        body: "Click it the way a shopper would. The box should open.",
        label: "Promo code link",
        found: () => "Promo code link selected.",
        passThrough: true,
        checkElement: (el) =>
          isTextField(el)
            ? "That's the promo box itself. If you can see it, go back and choose \"Yes, I can see it\"."
            : isRevealControl(el)
              ? null
              : "That doesn't look like something a shopper clicks. Click the link or button that opens the promo box.",
      });
      if (picked === "next") return "next";
      // Back from the link pick returns to the question.
    }
  },
};

const promoFieldStep: Step = {
  run: (env) =>
    pickStep(env, {
      key: "promoField",
      index: 3,
      title: "Click the promo code box",
      body: "Click the box where a shopper types a discount or promo code.",
      label: "Promo code box",
      found: () => "Promo code box selected.",
      resolve: promoFieldFor,
      checkElement: (el) =>
        isTextField(el) ? null : "That isn't a text box. Click the box where a shopper types the code.",
      helpers: () => {
        const reveal = env.progress.reveal === "link" ? located(env, "revealLink") : null;
        return reveal
          ? [{ id: "open", label: "Open the promo box", kind: "secondary", onClick: () => clickPastPicker(reveal) }]
          : [];
      },
    }),
};

const applyButtonStep: Step = {
  run: (env) =>
    pickStep(env, {
      key: "applyButton",
      index: 4,
      title: "Click the apply button",
      body: "Click the button a shopper presses to apply the code. Saverlly won't press it.",
      label: "Apply button",
      found: () => "Apply button selected.",
      suggest: () => {
        const field = located(env, "promoField");
        const reveal = located(env, "revealLink");
        return field ? suggestApplyButton(field, reveal ? [reveal] : []) : null;
      },
      checkElement: (el) => {
        const reveal = located(env, "revealLink");
        if (reveal && (reveal === el || reveal.contains(el)))
          return "That's the link that opens the promo box. Click the button that applies the code.";
        return isButtonLike(el) ? null : "That doesn't look like a button. Click the button a shopper presses to apply the code.";
      },
    }),
};

function priceText(target: Element | null): string {
  const text = target?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

const cartTotalStep: Step = {
  run: (env) =>
    pickStep(env, {
      key: "cartTotal",
      index: 5,
      title: "Click the order total",
      body: "Click the final amount the shopper pays, not the subtotal or the word \"Total\".",
      label: "Order total",
      found: (target) => (target ? `Order total selected: ${priceText(target)}` : "Order total selected."),
      resolve: (target) => target,
      checkSelector: (selector) =>
        readTotal(selector) === null ? "That doesn't look like a price. Click the order total amount itself." : null,
    }),
};


/** The recipe as far as the admin has chosen it: enough to submit a code. */
function recipeSoFar(progress: SetupProgress): CheckoutRecipe | null {
  const { promoField, applyButton, cartTotal, revealLink } = progress.picks;
  if (!promoField || !applyButton || !cartTotal || !progress.pattern) return null;
  return {
    couponFieldSelector: promoField.selector,
    applyButtonSelector: applyButton.selector,
    cartTotalSelector: cartTotal.selector,
    checkoutUrlPatterns: [progress.pattern],
    couponFieldRevealSelector: progress.reveal === "link" ? revealLink?.selector : undefined,
    successIndicatorSelector: "",
    failureIndicatorSelector: "",
  };
}

// A page reload showing the store's answer arrives within seconds; anything older is stale.
const PENDING_TEST_MS = 2 * 60_000;

function quoted(target: Element | null): string {
  const text = target?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > 90 ? `"${text.slice(0, 89)}…"` : `"${text}"`;
}

const TEST_PROBLEMS: Record<Exclude<TestCodeOutcome["kind"], "answered">, string> = {
  "no-field": "Saverlly couldn't find the promo box on this page. Go back and check the steps before this one.",
  "button-disabled":
    "The apply button stayed disabled after the code was typed in. Go back and check you chose the right box and button.",
  accepted:
    "The store accepted a made-up code: the order total went down. Go back and check the apply button and order total you chose.",
};

const failureMessageStep: Step = {
  run: async (env) => {
    const step = { index: 6, total: COUNTED_STEPS };
    let code = env.progress.pendingTest?.code ?? testCode();
    const finish = () => clearTestCode(env.progress.picks.promoField?.selector ?? "", code);
    const checkActive = () => {
      if (env.signal.aborted) throw stopped();
    };
    const pickMessage = (manualProblem?: string) =>
      pickStep(env, {
        key: "failureMessage",
        index: 6,
        title: "Click the store's error message",
        body: manualProblem ?? "Click the message the store showed when it rejected the test code.",
        label: "Error message",
        found: (target) => `Error message selected: ${quoted(target)}`,
        resolve: (target) => target,
        volatileText: () => [code],
        checkElement: (el) =>
          (el.textContent ?? "").trim().length >= 2 ? null : "That has no text. Click the message itself.",
      });
    let problem: string | undefined;

    for (;;) {
      const chosen = env.progress.picks.failureMessage;
      if (chosen) {
        const target = located(env, "failureMessage");
        env.overlay.highlight(target, "Error message");
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "The store's error message",
            body: "Saverlly will use this to tell when the store rejects a code.",
            result: target ? `Error message selected: ${quoted(target)}` : "Error message selected.",
            detail: chosen.selector,
            actions: [
              { id: "next", label: "Continue", kind: "primary", onClick: on("next") },
              { id: "retry", label: "Test again", kind: "secondary", onClick: on("retry") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        env.overlay.highlight(null);
        if (choice !== "retry") {
          finish();
          return choice === "next" ? "next" : "back";
        }
        delete env.progress.picks.failureMessage;
        await env.save(env.progress);
        continue;
      }
      if (env.progress.noFailureMessage) {
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "No error message",
            body: "You chose to go on without one. Without it Saverlly can't tell when a store rejects a code, so the final test will likely fail.",
            tone: "error",
            actions: [
              { id: "next", label: "Continue anyway", kind: "primary", onClick: on("next") },
              { id: "retry", label: "Test again", kind: "secondary", onClick: on("retry") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice !== "retry") return choice === "next" ? "next" : "back";
        env.progress.noFailureMessage = false;
        await env.save(env.progress);
        continue;
      }

      const recipe = recipeSoFar(env.progress);
      if (!recipe) return "back";
      let candidates: Element[] | null = null;
      const pending = env.progress.pendingTest;
      if (pending && Date.now() - pending.at < PENDING_TEST_MS) {
        // The page was reloaded after the test code was submitted: no before and after to
        // compare, so look for a message-like element on the page as it is now.
        const field = findElement(recipe.couponFieldSelector);
        const excluded = [field, findElement(recipe.applyButtonSelector), findElement(recipe.cartTotalSelector)].filter(
          (x): x is HTMLElement => !!x,
        );
        candidates = field ? rankMessages(scanForMessages(), field, excluded) : [];
        env.progress.pendingTest = undefined;
        await env.save(env.progress);
      } else {
        env.progress.pendingTest = undefined;
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Learn the store's error message",
            body: "Saverlly will type a made-up code and press Apply, to see how this store says a code didn't work. Nothing is ordered or charged.",
            result: problem,
            tone: problem ? "error" : "info",
            actions: [
              { id: "run", label: "Try a test code", kind: "primary", onClick: on("run") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice === "back") return "back";
        code = testCode();
        env.progress.pendingTest = { code, at: Date.now() };
        await env.save(env.progress);
        env.overlay.render({ step, title: "Trying a test code…", body: `Entering ${code} and pressing Apply.`, actions: [] });
        const outcome = await submitTestCode(recipe, code, checkActive);
        env.progress.pendingTest = undefined;
        await env.save(env.progress);
        if (outcome.kind !== "answered") {
          problem = TEST_PROBLEMS[outcome.kind];
          finish();
          continue;
        }
        candidates = outcome.candidates;
      }
      problem = undefined;

      const best = candidates[0];
      if (best) {
        env.overlay.highlight(best, "Error message?");
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Is this the store's error message?",
            body: "This appeared after the test code was entered.",
            result: quoted(best),
            actions: [
              { id: "yes", label: "Yes, that's it", kind: "primary", onClick: on("yes") },
              { id: "no", label: "No, I'll choose it", kind: "secondary", onClick: on("no") },
              { id: "retry", label: "Try again", kind: "link", onClick: on("retry") },
            ],
          }),
        );
        env.overlay.highlight(null);
        if (choice === "retry") {
          finish();
          continue;
        }
        if (choice === "yes") {
          const outcome = toPick(best, {
            key: "failureMessage",
            index: 6,
            title: "",
            body: "",
            label: "Error message",
            found: () => "",
            volatileText: () => [code],
          });
          if ("pick" in outcome) {
            env.progress.picks.failureMessage = outcome.pick;
            await env.save(env.progress);
            continue;
          }
          problem = outcome.problem;
        }
        const result = await pickMessage(problem);
        finish();
        return result;
      }

      const choice = await choose(env, (on) =>
        env.overlay.render({
          step,
          title: "Saverlly didn't spot a message",
          body: "If the store showed one, click it. If nothing appeared, try again, or skip this step.",
          tone: "error",
          actions: [
            { id: "pick", label: "Click the message", kind: "primary", onClick: on("pick") },
            { id: "retry", label: "Try again", kind: "secondary", onClick: on("retry") },
            { id: "skip", label: "Skip (not recommended)", kind: "link", onClick: on("skip") },
          ],
        }),
      );
      if (choice === "retry") {
        finish();
        continue;
      }
      if (choice === "skip") {
        finish();
        env.progress.noFailureMessage = true;
        await env.save(env.progress);
        continue;
      }
      const result = await pickMessage();
      finish();
      return result;
    }
  },
};

// The admin may take a while to find and type a code; past this a pending apply is stale.
const PENDING_REAL_MS = 15 * 60_000;

function realCodeSummary(progress: SetupProgress): string[] {
  if (progress.realCode === "skipped")
    return ["Skipped. Saverlly will apply the first code that works and won't compare codes on this store."];
  const notes = [
    progress.picks.successMessage
      ? "Applied-code message: found."
      : "Applied-code message: none. Saverlly will go by the order total going down.",
    progress.applyMode === "remove"
      ? "Removing a code: works. Saverlly can safely compare several codes."
      : "Removing a code: not available. Saverlly will apply the first code that works.",
  ];
  if (progress.codeStillApplied) notes.push("Your code is still applied in this cart. Remove it yourself if you like.");
  return notes;
}

/** Asks about one finding ("Is this the applied-code message?"), with a manual pick fallback.
 *  Resolves once the admin has confirmed one, picked one, or said there isn't one. */
async function confirmFinding(
  env: FlowEnv,
  options: PickStepOptions & {
    question: string;
    none: string;
    best: Element | undefined;
    /** How to quote the candidate; defaults to its text. */
    describe?: (el: Element) => string;
  },
): Promise<void> {
  const step = { index: options.index, total: COUNTED_STEPS };
  if (options.best) {
    env.overlay.highlight(options.best, `${options.label}?`);
    const choice = await choose(env, (on) =>
      env.overlay.render({
        step,
        title: options.question,
        body: options.body,
        result: options.describe ? options.describe(options.best!) : quoted(options.best!),
        actions: [
          { id: "yes", label: "Yes, that's it", kind: "primary", onClick: on("yes") },
          { id: "no", label: "No, I'll choose it", kind: "secondary", onClick: on("no") },
          { id: "none", label: options.none, kind: "link", onClick: on("none") },
        ],
      }),
    );
    env.overlay.highlight(null);
    if (choice === "none") return;
    if (choice === "yes") {
      const outcome = toPick(options.best, options);
      if ("pick" in outcome) {
        env.progress.picks[options.key] = outcome.pick;
        await env.save(env.progress);
        return;
      }
    }
  } else {
    const choice = await choose(env, (on) =>
      env.overlay.render({
        step,
        title: options.question,
        body: "Saverlly didn't spot one. If there is one on the page, click it.",
        actions: [
          { id: "pick", label: "Click it", kind: "primary", onClick: on("pick") },
          { id: "none", label: options.none, kind: "link", onClick: on("none") },
        ],
      }),
    );
    if (choice === "none") return;
  }
  // Picked by hand; whichever way the admin leaves the pick, what they chose is kept.
  await pickStep(env, options);
}

const realCodeStep: Step = {
  run: async (env) => {
    const step = { index: 7, total: COUNTED_STEPS };
    const checkActive = () => {
      if (env.signal.aborted) throw stopped();
    };
    let problem: string | undefined;
    for (;;) {
      const progress = env.progress;
      if (progress.realCode) {
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Working code",
            body: progress.realCode === "skipped" ? "You skipped trying a working code." : "Here is what Saverlly learned from your code.",
            notes: realCodeSummary(progress),
            actions: [
              { id: "next", label: "Continue", kind: "primary", onClick: on("next") },
              { id: "redo", label: "Try a code again", kind: "secondary", onClick: on("redo") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice !== "redo") return choice === "next" ? "next" : "back";
        progress.realCode = undefined;
        progress.applyMode = undefined;
        progress.codeStillApplied = undefined;
        delete progress.picks.successMessage;
        delete progress.picks.removeControl;
        await env.save(progress);
        continue;
      }

      const recipe = recipeSoFar(progress);
      if (!recipe) return "back";
      let pending = progress.pendingReal && Date.now() - progress.pendingReal.at < PENDING_REAL_MS ? progress.pendingReal : undefined;
      let watch: ReturnType<typeof watchChanges> | null = null;
      let typed: ReturnType<typeof watchTypedCode> | null = null;
      let fieldBefore: Element | null = null;

      if (!pending) {
        progress.pendingReal = undefined;
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Try a code that works (optional)",
            body: "With a code that works on this store, Saverlly learns how the store shows an applied code and how to remove it, so it can safely compare several codes. Without one, Saverlly will apply the first code that works.",
            result: problem,
            tone: problem ? "error" : "info",
            actions: [
              { id: "start", label: "I have a code", kind: "primary", onClick: on("start") },
              { id: "skip", label: "Skip", kind: "secondary", onClick: on("skip") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice === "back") return "back";
        if (choice === "skip") {
          progress.realCode = "skipped";
          await env.save(progress);
          continue;
        }
        problem = undefined;
        await new CheckoutActions(recipe, checkActive).reveal().catch((error: unknown) => {
          if (env.signal.aborted) throw error;
        });
        const before = readTotal(recipe.cartTotalSelector);
        if (before === null) {
          problem = "Saverlly couldn't read the order total on this page. Go back and check the order total you chose.";
          continue;
        }
        const started: NonNullable<SetupProgress["pendingReal"]> = { before, at: Date.now() };
        pending = started;
        progress.pendingReal = started;
        await env.save(progress);
        fieldBefore = findElement(recipe.couponFieldSelector);
        watch = watchChanges();
        typed = watchTypedCode(recipe.couponFieldSelector, (code) => {
          started.code = code;
          progress.pendingReal = { ...started };
          void env.save(progress);
        });
        const applied = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Apply your code",
            body: "Type a code that works into the store's promo box and press the store's own Apply button, the way a shopper would. Then come back here.",
            actions: [
              { id: "done", label: "I've applied it", kind: "primary", onClick: on("done") },
              { id: "cancel", label: "Cancel", kind: "link", onClick: on("cancel") },
            ],
          }),
        ).catch((error: unknown) => {
          watch?.stop();
          typed?.stop();
          throw error;
        });
        if (applied === "cancel") {
          watch.stop();
          typed.stop();
          progress.pendingReal = undefined;
          await env.save(progress);
          continue;
        }
        env.overlay.render({ step, title: "Checking the result…", body: "Waiting for the store to finish updating the order.", actions: [] });
        await settle(watch, checkActive, { minMs: 300, maxMs: 5_000 });
      }

      // Judged right after applying, or on the page the store reloaded to show the result.
      const code = typed?.current() || pending.code;
      const changed = watch ? Array.from(watch.changed) : null;
      watch?.stop();
      typed?.stop();
      progress.pendingReal = undefined;
      await env.save(progress);
      const before = pending.before;
      const after = readTotal(recipe.cartTotalSelector);
      if (after === null || cents(after) >= cents(before)) {
        problem =
          after === null
            ? "Saverlly couldn't read the order total after the code was applied."
            : `The order total didn't go down (it's still ${after.toFixed(2)}). Check the code works on this store and try again, or skip this step.`;
        continue;
      }

      const field = findElement(recipe.couponFieldSelector) ?? (fieldBefore?.isConnected ? fieldBefore : null);
      const excluded = [
        field,
        findElement(recipe.applyButtonSelector),
        findElement(recipe.cartTotalSelector),
        located(env, "failureMessage"),
      ].filter((x): x is HTMLElement => !!x);
      const volatileText = () => (code ? [code] : []);

      await confirmFinding(env, {
        key: "successMessage",
        index: 7,
        title: "Click how the store shows the code was applied",
        body: "This is often a message, or a tag showing the code with its discount.",
        label: "Applied-code message",
        found: (target) => `Applied-code message selected: ${quoted(target)}`,
        resolve: (target) => target,
        volatileText,
        question: "Is this how the store shows the code was applied?",
        none: "There isn't one",
        best: rankSuccess(changed ?? scanForMessages(), field, excluded, code)[0],
      });

      const controls = [...(changed ?? []), ...scanForControls()];
      await confirmFinding(env, {
        key: "removeControl",
        index: 7,
        title: "Click how a shopper removes the code",
        body: "Usually a \"Remove\" link or an × next to the applied code. Saverlly will click it to check it works.",
        label: "Remove control",
        found: () => "Remove control selected.",
        volatileText,
        checkElement: (el) =>
          isButtonLike(el) ? null : "That doesn't look like something a shopper clicks. Click the remove link or ×.",
        question: "Is this how a shopper removes the code?",
        none: "There isn't a way",
        // An × says little; its accessible name ("Remove SAVE10") says what it does. Shown to
        // the admin only: volatileText keeps the code itself out of the selector.
        describe: (el) => {
          const label = (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "").trim();
          return label ? `"${label}"` : quoted(el);
        },
        best: rankRemove(controls, excluded, code)[0],
      });

      // Only a removal seen to restore the total proves codes can be compared one at a time.
      const remove = progress.picks.removeControl;
      progress.applyMode = undefined;
      progress.codeStillApplied = true;
      if (remove) {
        env.overlay.render({ step, title: "Removing the code…", body: "Checking the order total goes back up.", actions: [] });
        const actions = new CheckoutActions(
          { ...recipe, couponApplyMode: "remove", removeCouponSelector: remove.selector },
          checkActive,
        );
        actions.currentCode = code || "applied";
        try {
          await actions.resetCart(before);
          progress.applyMode = "remove";
          progress.codeStillApplied = false;
        } catch (error) {
          if (env.signal.aborted) throw error;
          delete progress.picks.removeControl;
        }
      }
      progress.realCode = "done";
      await env.save(progress);
    }
  },
};

// A store reloading the page answers within seconds; an older marker is from another visit.
const PENDING_FINAL_MS = 2 * 60_000;
const OUTCOME_MARK = { pass: "✓", fail: "✗", skipped: "–" } as const;

const testAndSendStep: Step = {
  run: async (env) => {
    const step = { index: 8, total: COUNTED_STEPS };
    const checkActive = () => {
      if (env.signal.aborted) throw stopped();
    };
    let result: StoreSetupTestResult | null = null;
    let problem: string | undefined;
    for (;;) {
      const progress = env.progress;
      const recipe = buildRecipe(progress);
      if (!recipe) return "back";

      if (progress.submitted) {
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Sent to the dashboard",
            body: `Open ${env.storeName} in the Saverlly dashboard to review the result and press "Save recipe to store". Nothing changes for shoppers until then.`,
            actions: [
              { id: "stop", label: "Finish setup on this page", kind: "primary", onClick: on("stop") },
              { id: "again", label: "Test and send again", kind: "secondary", onClick: on("again") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice === "back") return "back";
        if (choice === "stop") {
          env.stop();
          throw stopped();
        }
        progress.submitted = false;
        await env.save(progress);
        result = null;
        continue;
      }

      const onAttempt = async (phase: "start" | "end") => {
        progress.pendingFinal = phase === "start" ? { at: Date.now() } : undefined;
        await env.save(progress);
      };
      const interrupted = progress.pendingFinal && Date.now() - progress.pendingFinal.at < PENDING_FINAL_MS;
      if (!result && interrupted) {
        // The page reloaded while the last test was submitting its code.
        progress.pendingFinal = undefined;
        await env.save(progress);
        env.overlay.render({ step, title: "Testing the recipe…", body: "Checking the page after it reloaded.", actions: [] });
        result = await runFinalTest(recipe, progress, checkActive, { reloaded: true });
      } else if (!result) {
        progress.pendingFinal = undefined;
        const choice = await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "Test and send",
            body: "Saverlly will run the recipe once more, the way it will for shoppers: open the promo box, try a made-up code and read the total. Then you can send it to the dashboard to review and save.",
            actions: [
              { id: "run", label: "Run the test", kind: "primary", onClick: on("run") },
              { id: "back", label: "Back", kind: "link", onClick: on("back") },
            ],
          }),
        );
        if (choice === "back") return "back";
        env.overlay.render({ step, title: "Testing the recipe…", body: "This takes a few seconds.", actions: [] });
        result = await runFinalTest(recipe, progress, checkActive, { onAttempt });
      }

      const tested = result;
      const choice = await choose(env, (on) =>
        env.overlay.render({
          step,
          title: tested.passed ? "The recipe works" : "Some checks didn't pass",
          body: tested.passed
            ? "Send it to the dashboard, then review and save it there."
            : "Go back to fix them, or send it anyway: the dashboard shows what failed before anything is saved.",
          notes: tested.checks.map((c) => `${OUTCOME_MARK[c.outcome]} ${CHECK_LABELS[c.key]}: ${c.detail ?? ""}`.trim()),
          result: problem,
          tone: problem || !tested.passed ? "error" : "info",
          actions: [
            { id: "send", label: tested.passed ? "Send to dashboard" : "Send anyway", kind: "primary", onClick: on("send") },
            { id: "retry", label: "Test again", kind: "secondary", onClick: on("retry") },
            { id: "back", label: "Back", kind: "link", onClick: on("back") },
          ],
        }),
      );
      problem = undefined;
      if (choice === "back") return "back";
      if (choice === "retry") {
        result = null;
        continue;
      }
      env.overlay.render({ step, title: "Sending…", body: "Sending the recipe to the dashboard.", actions: [] });
      const sent = await env.submit({ recipe, testResult: tested });
      if (sent.ok) {
        progress.submitted = true;
        await env.save(progress);
        continue;
      }
      if (sent.ended) {
        await choose(env, (on) =>
          env.overlay.render({
            step,
            title: "This setup session has ended",
            body: "It was ended on the dashboard, replaced by a newer code, or it expired. Start a new one from the dashboard to send this store's recipe.",
            tone: "error",
            actions: [{ id: "stop", label: "Close", kind: "primary", onClick: on("stop") }],
          }),
        );
        env.stop();
        throw stopped();
      }
      problem = sent.error;
    }
  },
};

export const SETUP_STEPS: Step[] = [
  {
    run: async (env) => {
      await choose(env, (on) =>
        env.overlay.render({
          title: `Set up ${env.storeName}`,
          body: "Saverlly will walk you through this checkout: you'll click the promo code box, the apply button and the order total. Nothing changes for shoppers until you save the result on the dashboard.",
          actions: [{ id: "start", label: "Start", kind: "primary", onClick: on("start") }],
        }),
      );
      return "next";
    },
  },
  checkoutPageStep,
  revealStep,
  promoFieldStep,
  applyButtonStep,
  cartTotalStep,
  failureMessageStep,
  realCodeStep,
  testAndSendStep,
];

/** Runs the steps from wherever progress says, until setup is stopped (signal aborts). */
export async function runSetupFlow(env: FlowEnv): Promise<void> {
  try {
    for (;;) {
      env.overlay.highlight(null);
      const result = await SETUP_STEPS[env.progress.step].run(env);
      const next = env.progress.step + (result === "next" ? 1 : -1);
      env.progress.step = Math.min(Math.max(next, 0), SETUP_STEPS.length - 1);
      await env.save(env.progress);
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  }
}
