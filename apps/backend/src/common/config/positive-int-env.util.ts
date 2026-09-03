/**
 * Parses an env-sourced numeric config value, falling back to `fallback` when the raw
 * value is missing, non-finite, or not strictly positive, a malformed value (e.g. "abc",
 * "-5", "0") must never silently propagate into a date/interval calculation as NaN.
 */
export function parsePositiveIntEnv(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
