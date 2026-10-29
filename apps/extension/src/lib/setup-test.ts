import type { CheckoutRecipe, StoreSetupCheck, StoreSetupTestResult } from "@saverlly/shared-types";
import { CheckoutActions, ComparisonError, readTotal } from "./checkout-actions";
import { element as findElement } from "./checkout-dom";
import { matchesCheckoutUrl } from "./checkout-match";
import type { SetupProgress } from "./setup-flow";
import { clearTestCode, testCode } from "./setup-learn";

// The final check before a draft goes to the dashboard: the recipe is run once more from
// scratch through the shopper's own checkout code (CheckoutActions), and every part of it is
// reported as a plain-language check the dashboard shows the admin.

/** The draft recipe from everything the admin chose, or null if a required part is missing. */
export function buildRecipe(progress: SetupProgress): CheckoutRecipe | null {
  const { promoField, applyButton, cartTotal, revealLink, failureMessage, successMessage, removeControl } = progress.picks;
  if (!promoField || !applyButton || !cartTotal || !progress.pattern) return null;
  const recipe: CheckoutRecipe = {
    couponFieldSelector: promoField.selector,
    applyButtonSelector: applyButton.selector,
    cartTotalSelector: cartTotal.selector,
    checkoutUrlPatterns: [progress.pattern],
  };
  if (progress.reveal === "link" && revealLink) recipe.couponFieldRevealSelector = revealLink.selector;
  if (failureMessage) recipe.failureIndicatorSelector = failureMessage.selector;
  if (successMessage) recipe.successIndicatorSelector = successMessage.selector;
  // Comparing codes is only switched on once removing one was seen to restore the total.
  if (progress.applyMode === "remove" && removeControl) {
    recipe.couponApplyMode = "remove";
    recipe.removeCouponSelector = removeControl.selector;
  }
  return recipe;
}

const MAX_DETAIL = 300;
const check = (key: StoreSetupCheck["key"], outcome: StoreSetupCheck["outcome"], detail: string): StoreSetupCheck => ({
  key,
  outcome,
  detail: detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL - 1)}…` : detail,
});

/** The same names the dashboard uses for each check. */
export const CHECK_LABELS: Record<StoreSetupCheck["key"], string> = {
  checkoutPage: "Checkout page",
  revealLink: "Promo code link",
  promoField: "Promo code box",
  applyButton: "Apply button",
  cartTotal: "Order total",
  failureMessage: "Message for a rejected code",
  successMessage: "Message for an accepted code",
  applyMode: "Trying one code after another",
};

/** Set when the store reloaded the page in the middle of a test: see runFinalTest. */
export const RELOADED_DURING_TEST =
  "The store reloaded the page to apply the code. Saverlly's coupon testing can't carry on across a reload, so this store can't be automated yet.";

/**
 * Runs the draft recipe end to end. Never throws for a store problem: each failure becomes a
 * failed check. Only the caller's guard (setup stopped) is rethrown.
 *
 * `reloaded` reports the previous run was cut short by the store reloading the page.
 */
export async function runFinalTest(
  recipe: CheckoutRecipe,
  progress: SetupProgress,
  checkActive: () => void,
  {
    reloaded = false,
    code = testCode(),
    onAttempt,
  }: {
    reloaded?: boolean;
    code?: string;
    /** Called around submitting the test code: the one moment a store may reload the page. */
    onAttempt?: (phase: "start" | "end") => Promise<void>;
  } = {},
): Promise<StoreSetupTestResult> {
  const checks: StoreSetupCheck[] = [];
  const pattern = recipe.checkoutUrlPatterns[0];
  checks.push(
    matchesCheckoutUrl(location.href, recipe.checkoutUrlPatterns)
      ? check("checkoutPage", "pass", `Runs on pages whose address contains ${pattern}.`)
      : check("checkoutPage", "fail", `This page's address doesn't contain ${pattern}, so Saverlly wouldn't run here.`),
  );

  const actions = new CheckoutActions(recipe, checkActive);
  let usable = true;
  try {
    await actions.reveal();
  } catch (error) {
    if (!(error instanceof ComparisonError)) throw error;
    usable = false;
  }
  if (recipe.couponFieldRevealSelector) {
    const link = findElement(recipe.couponFieldRevealSelector);
    checks.push(
      usable
        ? check("revealLink", "pass", "Opens the promo box.")
        : link
          ? check("revealLink", "fail", "Clicking it didn't open the promo box.")
          : check("revealLink", "fail", "The link that opens the promo box isn't on this page."),
    );
  }
  const field = findElement<HTMLInputElement>(recipe.couponFieldSelector);
  const button = findElement(recipe.applyButtonSelector);
  checks.push(
    field && !field.disabled
      ? check("promoField", "pass", "Found the promo code box.")
      : check("promoField", "fail", field ? "The promo code box is disabled." : "The promo code box isn't on this page."),
    button
      ? check("applyButton", "pass", "Found the apply button.")
      : check("applyButton", "fail", "The apply button isn't on this page."),
  );
  const total = readTotal(recipe.cartTotalSelector);
  checks.push(
    total !== null
      ? check("cartTotal", "pass", `Read the order total: ${total.toFixed(2)}.`)
      : check("cartTotal", "fail", "Couldn't read a price from the order total."),
  );

  if (reloaded) checks.push(check("failureMessage", "fail", RELOADED_DURING_TEST));
  else if (!recipe.failureIndicatorSelector)
    checks.push(check("failureMessage", "fail", "No error message chosen, so Saverlly can't tell when the store rejects a code."));
  else if (!usable || !field || !button)
    checks.push(check("failureMessage", "skipped", "Not tested: the promo box or apply button isn't usable."));
  else {
    try {
      await onAttempt?.("start");
      const attempt = await actions.attempt(code);
      checks.push(
        attempt.outcome === "failure"
          ? check("failureMessage", "pass", "The store rejected the test code, and Saverlly recognised its message.")
          : attempt.outcome === "success"
            ? check("failureMessage", "fail", "The store accepted a made-up code. Check the apply button and order total.")
            : check("failureMessage", "fail", "Saverlly didn't recognise the store's answer to the test code. Check the error message you chose."),
      );
    } catch (error) {
      if (!(error instanceof ComparisonError)) throw error;
      checks.push(check("failureMessage", "fail", "The checkout changed while the test code was being tried. Try the test again."));
    } finally {
      clearTestCode(recipe.couponFieldSelector, code);
      await onAttempt?.("end");
    }
  }

  // Proven in the working-code step with the admin's own code, through the same shopper code
  // (CheckoutActions.resetCart). That code isn't kept, so it can't be re-run here.
  if (progress.realCode === "done") {
    checks.push(
      recipe.successIndicatorSelector
        ? check("successMessage", "pass", "Found when your working code was applied.")
        : check("successMessage", "skipped", "No applied-code message: Saverlly will go by the order total going down."),
      recipe.couponApplyMode === "remove"
        ? check("applyMode", "pass", "Removing a code restores the total, so Saverlly can safely compare codes.")
        : check("applyMode", "skipped", "Removing a code wasn't possible, so Saverlly will apply the first code that works."),
    );
  } else {
    checks.push(
      check("successMessage", "skipped", "No working code was tried."),
      check("applyMode", "skipped", "No working code was tried, so Saverlly will apply the first code that works."),
    );
  }

  return {
    passed: checks.every((c) => c.outcome !== "fail"),
    checks,
    ...(total !== null ? { cartTotal: Math.round(total * 100) / 100 } : {}),
    testedAt: new Date().toISOString(),
  };
}
