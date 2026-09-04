"use client"

import { toast } from "sonner"
import { CheckIcon, CopyIcon } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"

/**
 * The one-time password readout shown after an account is created or its password reset.
 *
 * The client reported never receiving a new team member's first-time password. The email is one
 * half of that; this is the other. It is deliberately loud (mono, boxed, its own copy button)
 * rather than a line of body text, because it is the only chance to capture the value.
 */
export function CredentialReveal({
  email,
  password,
}: {
  email: string
  password: string
}) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      toast.success("Password copied.")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/8 bg-muted/40 p-4 text-left dark:border-white/10">
      <div className="flex flex-col gap-0.5">
        <span className="text-meta text-muted-foreground">Signs in with</span>
        <span className="truncate text-sm font-medium">{email}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-meta text-muted-foreground">Temporary password</span>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-black/8 bg-background px-3 py-2 font-mono text-sm tracking-wider dark:border-white/10">
            {password}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copy}
            aria-label="Copy password"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </Button>
        </div>
      </div>
      <p className="text-meta text-muted-foreground">
        They will be asked to set their own password the first time they sign in.
      </p>
    </div>
  )
}
