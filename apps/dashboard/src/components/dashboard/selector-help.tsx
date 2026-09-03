"use client"

import { HelpCircleIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** Explains what a CSS selector is and how to get one, inline next to the field that asks for
 * it. The client has asked "what is the coupon code selector and how do I get it?" twice now;
 * the answer previously only existed in a hand-written doc
 * (corrections/technical-explanations-for-client.md), so it kept getting re-asked. Putting it
 * where the question occurs is what stops that. */
export function SelectorHelp({ label = "How do I find this?" }: { label?: string }) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        <HelpCircleIcon className="size-3.5" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2 text-sm">
        <p className="font-medium text-foreground">This is a CSS selector</p>
        <p className="text-muted-foreground">
          It tells the scraper exactly where on the page to read the coupon code from, rather
          than guessing.
        </p>
        <p className="text-muted-foreground">To get one:</p>
        <ol className="ml-4 list-decimal text-muted-foreground marker:text-muted-foreground/60">
          <li>Open the page in Chrome.</li>
          <li>Right-click the coupon code and choose Inspect.</li>
          <li>
            Right-click the highlighted row in the panel that opens, then choose Copy, then Copy
            selector.
          </li>
          <li>Paste it here.</li>
        </ol>
        <p className="text-muted-foreground">
          It usually looks something like{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.coupon-code</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">#promo span</code>. It
          is a one-time setup per store.
        </p>
      </PopoverContent>
    </Popover>
  )
}
