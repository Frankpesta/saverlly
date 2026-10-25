"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useFieldMessage } from "@/components/ui/field-message-context"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  disabled?: boolean
}

/** Cap on rendered `CommandItem`s for `allowCustomValue` lists. See the usage below. */
const MAX_RENDERED_OPTIONS = 50

interface ComboboxProps {
  id?: string
  options: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  size?: "sm" | "default"
  "aria-invalid"?: boolean
  "aria-label"?: string
  "aria-describedby"?: string
  /** Treat the options as suggestions rather than the only valid values (e.g. City): typed text
   * that matches nothing is offered as its own "Use …" row, and a value that isn't one of the
   * options still shows in the trigger. Typed text is never saved just by clicking away, so a
   * half-typed "Aus" can't silently become the value. Matches that start with the typed text
   * are listed before ones that merely contain it. */
  allowCustomValue?: boolean
}

function Combobox({
  id,
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  className,
  size = "default",
  allowCustomValue = false,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: ComboboxProps) {
  const field = useFieldMessage()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const selected = options.find((option) => option.value === value)
  const displayLabel = selected?.label ?? (allowCustomValue && value ? value : undefined)
  const trimmedQuery = query.trim()
  const customMatches = React.useMemo(() => {
    if (!allowCustomValue) return []
    const needle = trimmedQuery.toLowerCase()
    if (!needle) return options.slice(0, MAX_RENDERED_OPTIONS)
    const prefix: ComboboxOption[] = []
    const contains: ComboboxOption[] = []
    for (const option of options) {
      const label = option.label.toLowerCase()
      if (label.startsWith(needle)) prefix.push(option)
      else if (label.includes(needle)) contains.push(option)
      if (prefix.length >= MAX_RENDERED_OPTIONS) break
    }
    return [...prefix, ...contains].slice(0, MAX_RENDERED_OPTIONS)
  }, [allowCustomValue, options, trimmedQuery])
  const offerTypedValue =
    allowCustomValue &&
    trimmedQuery !== "" &&
    !options.some((option) => option.label.toLowerCase() === trimmedQuery.toLowerCase())

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid ?? field.invalid}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy ?? field.messageId}
          disabled={disabled}
          data-slot="select-trigger"
          data-size={size}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-3 pl-3 text-sm font-normal whitespace-nowrap shadow-[0_1px_2px_rgba(11,11,11,0.03)] hover:bg-transparent data-[size=default]:h-10 data-[size=sm]:h-7 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            !displayLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="line-clamp-1 flex items-center gap-1.5">
            {displayLabel ?? placeholder}
          </span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        // Radix's collision-avoidance flips this above the trigger whenever it measures more
        // room above than below. Inside a Dialog (which has its own overflow-y-auto so it can
        // scroll independently of the page) that boundary is the dialog's own remaining height,
        // not the page's, so a field positioned in the lower half of a tall dialog can flip
        // upward even though there's plenty of real screen space below. A combobox opening above
        // its own label is disorienting, so it's pinned to always open below instead, a long
        // list still gets its own internal scroll (see CommandList's max-height).
        avoidCollisions={false}
        sideOffset={4}
        className="w-(--radix-popover-trigger-width) min-w-48 p-0"
      >
        <Command shouldFilter={!allowCustomValue}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          {/* Capped shorter than Command's own 300px default: a field positioned low in a tall
           * dialog only has so much room below before Radix's collision-avoidance flips the
           * popover above the trigger instead, a shorter list needs less room, so it stays
           * anchored below across more dialog/viewport combinations. */}
          <CommandList className="max-h-[220px]">
            {!offerTypedValue && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {/* A large options list (e.g. every US city) can match hundreds of rows for a short
                * query, so allowCustomValue lists are capped. Typing more narrows the match. */}
              {(allowCustomValue ? customMatches : options).map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value)
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {offerTypedValue && (
                <CommandItem
                  value={`use:${trimmedQuery}`}
                  onSelect={() => {
                    onValueChange(trimmedQuery)
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  <span className="size-4" aria-hidden />
                  Use &ldquo;{trimmedQuery}&rdquo;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
