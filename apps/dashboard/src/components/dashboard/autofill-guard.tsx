"use client"

import * as React from "react"

/* Chrome autofills a saved credential into any field it can match by type + autocomplete
 * token, and it does this eagerly on mount, before the user has touched the page. That is
 * exactly the two bugs this file exists to stop:
 *  - "current password" fields (change-password-card.tsx, auth/change-password-form.tsx)
 *    autofilling the user's saved Saverlly password and staying that way indefinitely, even
 *    after a successful submit and reset() (the client's literal report: "if you enter it
 *    once, it stays there forever").
 *  - a bare `type="password"` credentials field with no autocomplete hint at all
 *    (key-value-editor.tsx's "Value" row), which Chrome still autofills because a password
 *    input sitting in a form next to a text input reads as a login form to its heuristics.
 *
 * Two independent defeats, used together:
 *  1. readOnly until first interaction. Chrome only autofills fields it considers editable at
 *     parse time, so a field that starts readOnly is skipped; removing readOnly right before
 *     the user interacts makes it behave like a normal input from then on. The removal
 *     mutates `event.currentTarget.readOnly` directly rather than only setting React state:
 *     a state update needs a render to reach the DOM, and a fast click-then-type (a password
 *     manager's own keyboard fill, or just a fast typist) can land its first keystrokes in
 *     that gap and lose them to the still-readOnly attribute. The synchronous mutation closes
 *     that window; the state update alongside it just keeps re-renders from reverting it.
 *  2. A decoy field placed earlier in the DOM with the exact type + autocomplete token Chrome
 *     is matching against. Password managers fill the *first* matching field on the page, so
 *     the decoy absorbs the autofill and the real field never sees it. It must be genuinely
 *     off-screen (not display:none, which some Chrome versions skip over when scanning for
 *     autofill targets) and must never be focusable or submitted.
 */

export function useAutofillReadOnly() {
  const [locked, setLocked] = React.useState(true)

  function unlock(event: React.SyntheticEvent<HTMLInputElement>) {
    event.currentTarget.readOnly = false
    setLocked(false)
  }

  return {
    readOnly: locked,
    onFocus: unlock,
    onPointerDown: unlock,
    onKeyDown: unlock,
  }
}

export function AutofillDecoy({ type = "password" }: { type?: "password" | "text" }) {
  return (
    <input
      type={type}
      name={type === "password" ? "password" : "username"}
      autoComplete={type === "password" ? "current-password" : "username"}
      tabIndex={-1}
      aria-hidden
      readOnly
      defaultValue=""
      className="absolute h-0 w-0 overflow-hidden opacity-0"
      style={{ pointerEvents: "none" }}
    />
  )
}
