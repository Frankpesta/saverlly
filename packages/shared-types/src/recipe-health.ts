// Keeping stores working: shoppers' checkouts report whether a store's recipe still finds the
// checkout, so a store that changed its page is flagged for a re-check instead of coupons
// quietly stopping.

/** What a checkout found wrong. Only reported with evidence the recipe is out of date: an
 *  obvious promo box the recipe no longer finds, or the recipe's promo box found but not its
 *  order total. A checkout step with no promo box at all reports nothing. */
export const RECIPE_PROBLEMS = ['PROMO_BOX_CHANGED', 'ORDER_TOTAL_CHANGED'] as const;
export type RecipeProblem = (typeof RECIPE_PROBLEMS)[number];

export const RECIPE_PROBLEM_LABELS: Record<RecipeProblem, string> = {
  PROMO_BOX_CHANGED: "Shoppers' checkouts show a promo box the saved setup no longer finds.",
  ORDER_TOTAL_CHANGED: "Shoppers' checkouts no longer show the order total where the saved setup expects it.",
};

/** POST /public/recipe-health */
export type RecipeHealthReportPayload =
  | { merchantId: string; ok: true }
  | { merchantId: string; ok: false; problem: RecipeProblem };

/** Devices that must independently report a problem before a store is flagged. */
export const RECIPE_RECHECK_DEVICES = 2;
