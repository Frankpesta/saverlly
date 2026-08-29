"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

/** Cap on rendered `CommandItem`s for `allowCustomValue` lists — see the usage below. */
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
  /** Free-typed text that doesn't match any option is discarded on blur/close (default combobox
   * behavior). Set true to also call onValueChange with the raw typed text when the popover
   * closes without a selected match — useful for fields that accept an option list as
   * suggestions but shouldn't hard-require picking one (e.g. City). */
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
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const selected = options.find((option) => option.value === value)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          if (allowCustomValue && query && !selected) {
            onValueChange(query)
          }
          setQuery("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          data-slot="select-trigger"
          data-size={size}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-3 pl-3 text-sm font-normal whitespace-nowrap shadow-[0_1px_2px_rgba(11,11,11,0.03)] hover:bg-transparent data-[size=default]:h-10 data-[size=sm]:h-7 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="line-clamp-1 flex items-center gap-1.5">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        // Radix's collision-avoidance flips this above the trigger whenever it measures more
        // room above than below — inside a Dialog (which has its own overflow-y-auto so it can
        // scroll independently of the page) that boundary is the dialog's own remaining height,
        // not the page's, so a field positioned in the lower half of a tall dialog can flip
        // upward even though there's plenty of real screen space below. A combobox opening above
        // its own label is disorienting, so it's pinned to always open below instead — a long
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
           * popover above the trigger instead — a shorter list needs less room, so it stays
           * anchored below across more dialog/viewport combinations. */}
          <CommandList className="max-h-[220px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {(allowCustomValue
                ? options
                    .filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
                    // A large options list (e.g. every US city) can match hundreds of rows for a
                    // one- or two-character query — capped so typing doesn't mount hundreds of
                    // DOM nodes on every keystroke. Typing more narrows the real match further.
                    .slice(0, MAX_RENDERED_OPTIONS)
                : options
              ).map((option) => (
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
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
