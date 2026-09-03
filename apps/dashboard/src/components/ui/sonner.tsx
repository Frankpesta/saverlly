"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

/** A colored icon badge matching the app's dialog icon-header convention (size-9 rounded-lg on
 *  a semantic tint), scaled down for a toast. Sonner only lets you swap the icon element itself
 *  (`icons` prop). Wrapping it here is how each toast type gets its own tint instead of a bare
 *  monochrome glyph. */
function ToastIcon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", className)}>
      {children}
    </span>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="toaster group"
      closeButton
      icons={{
        success: (
          <ToastIcon className="bg-[var(--success-tint)] text-[var(--success)]">
            <CircleCheckIcon className="size-4" />
          </ToastIcon>
        ),
        info: (
          <ToastIcon className="bg-[var(--info-tint)] text-[var(--info)]">
            <InfoIcon className="size-4" />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon className="bg-[var(--warning-tint)] text-[var(--warning)]">
            <TriangleAlertIcon className="size-4" />
          </ToastIcon>
        ),
        error: (
          <ToastIcon className="bg-destructive/10 text-destructive">
            <OctagonXIcon className="size-4" />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon className="bg-muted text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
          </ToastIcon>
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // Larger than the library default (8px) to match the app's rounded-2xl card language.
          "--border-radius": "var(--radius-2xl)",
          // sonner injects its own font-family + 13px font-size on [data-sonner-toaster] at a
          // higher specificity than a plain Tailwind class, so the app's brand font and type
          // scale need to come in as inline styles here to actually win.
          fontFamily: "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: false,
        classNames: {
          // sonner hardcodes padding/gap/box-shadow/font-size on the toast's own [data-styled]
          // rule (higher specificity than a bare Tailwind class, and injected after the app's
          // stylesheet). The `!` important-prefixed utilities are what actually override them.
          toast:
            "group !items-start !gap-3 !px-4 !py-3.5 !text-sm !shadow-[var(--elevation-lg)] backdrop-blur-sm",
          icon: "!m-0 mt-0.5",
          content: "!gap-1",
          title: "!text-sm !font-semibold",
          // sonner hardcodes the description color per-theme (not one of our CSS vars)
          // !text-muted-foreground is what makes it follow the app's token instead.
          description: "!text-muted-foreground",
          closeButton: "hover:!bg-muted hover:!text-foreground hover:!border-border",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
