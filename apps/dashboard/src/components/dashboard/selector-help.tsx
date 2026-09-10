"use client"

import { HelpCircleIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const HOW_TO_INSPECT = (
  <ol className="ml-4 list-decimal text-muted-foreground marker:text-muted-foreground/60">
    <li>Open the page in Chrome.</li>
    <li>Right-click the element and choose Inspect.</li>
    <li>
      Right-click the highlighted row in the panel that opens, then choose Copy, then Copy
      selector.
    </li>
    <li>Paste it into the field.</li>
  </ol>
)

/** Explains what a CSS selector is and how to get one, inline next to the field that asks for
 * it. The client has asked "what is the coupon code selector and how do I get it?" twice now;
 * the answer previously only existed in a hand-written doc
 * (corrections/technical-explanations-for-client.md), so it kept getting re-asked. Putting it
 * where the question occurs is what stops that.
 *
 * `variant="reveal"` covers the follow-up question this raised once tried against a real
 * aggregator (RetailMeNot): some sites don't put the code in the page at all until a "Get Code"
 * button is clicked, so no codeSelector will ever find it there — that's what the reveal-button
 * selector field is for. */
export function SelectorHelp({
  label = "How do I find this?",
  variant = "code",
}: {
  label?: string
  variant?: "code" | "reveal"
}) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        <HelpCircleIcon className="size-3.5" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2 text-sm">
        {variant === "code" ? (
          <>
            <p className="font-medium text-foreground">This is a CSS selector</p>
            <p className="text-muted-foreground">
              It tells the scraper exactly where on the page to read the coupon code from,
              rather than guessing.
            </p>
            <p className="text-muted-foreground">To get one:</p>
            {HOW_TO_INSPECT}
            <p className="text-muted-foreground">
              It usually looks something like{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.coupon-code</code>{" "}
              or <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">#promo span</code>.
              It is a one-time setup per store.
            </p>
            <p className="text-muted-foreground">
              Some sites — RetailMeNot and most other coupon aggregators, in particular — don't
              put the code in the page at all until you click a "Get Code" button. Inspecting the
              page there won't find anything to select, because there's nothing there yet. If
              that's what you're looking at, use the reveal-button selector below instead of (or
              alongside) this one. The most reliable source for a selector here is a merchant's
              own site — a sitewide promo banner has no reason to hide its own code.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">Only needed for "click to reveal" codes</p>
            <p className="text-muted-foreground">
              Some sites hide the coupon code until you click a button like "Get Code" or "Reveal
              Code". If the code selector above isn't finding anything, this is usually why — the
              scraper loads the page exactly as it is, without clicking anything, so a hidden code
              is invisible to it.
            </p>
            <p className="text-muted-foreground">
              Give it a selector for that button (same method as the code selector — Inspect →
              Copy → Copy selector) and the scraper will click it first, then read the code.
            </p>
            {HOW_TO_INSPECT}
            <p className="text-muted-foreground">Leave this blank if the code is already visible on the page.</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
