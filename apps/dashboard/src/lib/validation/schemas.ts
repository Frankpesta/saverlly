import { z } from "zod"

/** Trims + lowercases before validating, mirroring the backend's `NormalizeEmail` transform
 * (`apps/backend/src/common/transformers/normalize-email.decorator.ts`). So a casing mismatch
 * between what's typed here and what the server ends up storing/comparing can never happen. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"))

/** Exactly mirrors the backend's `@IsStrongPassword()` regex
 * (`apps/backend/src/common/validators/is-strong-password.decorator.ts`): 8+ characters, at
 * least one letter, at least one number. Kept byte-for-byte identical so a password accepted
 * here is never rejected by the server, and vice versa. */
export const STRONG_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

export const passwordSchema = z
  .string()
  .regex(STRONG_PASSWORD_PATTERN, "Password must be at least 8 characters and include a letter and a number")

/** Cross-field "confirm password matches" check, apply with `.refine()` on a schema that
 * already has both a password field and a confirm field, e.g.:
 * `z.object({ newPassword: passwordSchema, confirmPassword: z.string() }).refine(passwordsMatch("newPassword", "confirmPassword"), passwordMismatchIssue("confirmPassword"))` */
export function passwordsMatch<T extends Record<string, unknown>>(passwordKey: keyof T, confirmKey: keyof T) {
  return (data: T) => data[passwordKey] === data[confirmKey]
}

export function passwordMismatchIssue(confirmKey: string, message = "Passwords don't match.") {
  return { message, path: [confirmKey] }
}

/** Mirrors the backend's `ZIP_PATTERN` (`apps/backend/src/locations/dto/create-location.dto.ts`)
 * byte-for-byte. Was 5-digit-US-only; widened per the client's request to also accept ZIP+4
 * ("12345-6789") and letter-and-dash postal codes like Canada's ("A1A 1A1"): letters, digits,
 * spaces, and dashes, 3 to 10 characters, first and last character alphanumeric. The
 * `Location.zip` DB column was already a nullable string for exactly this reason, so this is a
 * validation-only change, no migration involved. */
export const ZIP_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/

export const zipSchema = z
  .string()
  .trim()
  .regex(ZIP_PATTERN, "Enter a valid postal code (letters, numbers, spaces, and dashes, 3-10 characters)")

/** Mirrors the backend's `IsMultipleOf(5)` validator applied to `Kiosk.revenueSharePct`
 * (`apps/backend/src/common/validators/is-multiple-of.decorator.ts`), 0-100 in steps of 5. */
export const revenueShareSchema = z
  .number({ error: "Enter a revenue share percentage" })
  .min(0, "Must be at least 0%")
  .max(100, "Must be at most 100%")
  .multipleOf(5, "Must be a multiple of 5")

export const nameSchema = z.string().trim().min(1, "Name is required")

/** A kiosk/location/merchant "type the exact name to confirm" destructive-action field
 * `expectedName` is bound at schema-construction time (per dialog instance), not per-submission,
 * since the target being deleted doesn't change while the confirm dialog is open. */
export function exactMatchSchema(expectedName: string) {
  return z
    .string()
    .refine((value) => value === expectedName, { message: `Type "${expectedName}" to confirm.` })
}

const ATTRIBUTION_METHODS = ["COOKIE", "URL_PARAM", "BOTH"] as const

/** Mirrors the merchant attribution conditional-required rule already documented (and, per the
 * form-validation audit, only actually *enforced* in the create wizard, not the edit form) in
 * `apps/backend/src/merchants/dto/create-merchant.dto.ts`: COOKIE/BOTH needs a tracking URL,
 * URL_PARAM/BOTH needs a param key + value. Both the create wizard and the edit form import this
 * one schema now, so the enforcement gap between them closes as a side effect of the migration. */
export const attributionFieldsSchema = z
  .object({
    attributionMethod: z.enum(ATTRIBUTION_METHODS),
    affiliateTrackingUrl: z.string().trim().optional(),
    affiliateUrlParamKey: z.string().trim().optional(),
    affiliateUrlParamValue: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const needsTrackingUrl = data.attributionMethod === "COOKIE" || data.attributionMethod === "BOTH"
    const needsParam = data.attributionMethod === "URL_PARAM" || data.attributionMethod === "BOTH"

    if (needsTrackingUrl && !data.affiliateTrackingUrl) {
      ctx.addIssue({
        code: "custom",
        message: "Required for cookie-based tracking",
        path: ["affiliateTrackingUrl"],
      })
    }
    if (needsParam && !data.affiliateUrlParamKey) {
      ctx.addIssue({
        code: "custom",
        message: "Required for URL-parameter tracking",
        path: ["affiliateUrlParamKey"],
      })
    }
    if (needsParam && !data.affiliateUrlParamValue) {
      ctx.addIssue({
        code: "custom",
        message: "Required for URL-parameter tracking",
        path: ["affiliateUrlParamValue"],
      })
    }
  })
