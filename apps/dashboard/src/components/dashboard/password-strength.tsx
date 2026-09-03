"use client"

import { cn } from "@/lib/utils"

/** 0-3, matching what the backend actually enforces (`IsStrongPassword`: 8+ chars, a letter,
 * and a number) so the bar never shows "strong" for something the server would reject. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < 8) return 0
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  if (!hasLetter || !hasNumber) return 1
  return hasSymbol && password.length >= 12 ? 3 : 2
}

const LABEL = ["Too short", "Weak, needs a letter and a number", "Good", "Strong"] as const
const COLOR = [
  "bg-destructive",
  "bg-destructive",
  "bg-[var(--warning)]",
  "bg-[var(--success)]",
] as const

export function PasswordStrengthBar({ password }: { password: string }) {
  const strength = passwordStrength(password)
  if (!password) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                i <= (strength === 0 ? -1 : strength - 1) ? COLOR[strength] : "bg-transparent",
              )}
            />
          </div>
        ))}
      </div>
      <p className={cn("text-xs", strength <= 1 ? "text-destructive" : "text-muted-foreground")}>
        {LABEL[strength]}
      </p>
    </div>
  )
}
