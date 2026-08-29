"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

/** A comma/enter-delimited tag input that renders committed tags as removable chips, instead of
 * plain comma-separated text. Typing a comma (or pressing Enter) commits the current word into
 * its own chip; Backspace on an empty input removes the last chip. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  "aria-invalid"?: boolean
}) {
  const [draft, setDraft] = React.useState("")

  function commitDraft() {
    const tag = draft.trim()
    setDraft("")
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
    }
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div
      aria-invalid={ariaInvalid}
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 shadow-[0_1px_2px_rgba(11,11,11,0.03)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
      )}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
            className="rounded-full p-0.5 hover:bg-black/10"
          >
            <XIcon className="size-2.5" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => {
          const next = e.target.value
          if (next.endsWith(",")) {
            setDraft(next.slice(0, -1))
            commitDraft()
          } else {
            setDraft(next)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commitDraft()
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-24 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
