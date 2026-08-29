import { Transform } from 'class-transformer';

/** Trims and lowercases an email field before validation/persistence, so a login lookup
 * (exact-match against `User.email`) can't fail just because the casing typed at account
 * creation differs from the casing typed at login. */
export function NormalizeEmail() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}
