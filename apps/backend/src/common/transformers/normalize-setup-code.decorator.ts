import { Transform } from 'class-transformer';

/** Trims and uppercases a setup-code field before validation/persistence, so a device
 * registration lookup (exact-match against `LocationSetupCode.code`) can't fail just because
 * the kiosk owner typed/pasted the code in a different case than it was generated in. Codes
 * are always generated uppercase (see setup-code.util.ts's CHARSET). Same class of bug, same
 * fix shape, as normalize-email.decorator.ts. */
export function NormalizeSetupCode() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );
}
