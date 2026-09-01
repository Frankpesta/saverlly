/**
 * The two creative slots an admin uploads for every promotion. `small` is what actually renders in
 * the extension popup today; `large` is the standard leaderboard, captured now so the creative
 * exists whenever the on-page banner surface gets built.
 */
export const PROMOTION_CREATIVE_SIZES = {
  small: { width: 320, height: 100, label: 'popup banner' },
  large: { width: 728, height: 90, label: 'leaderboard banner' },
} as const;

export type PromotionCreativeSize = keyof typeof PROMOTION_CREATIVE_SIZES;

export function isPromotionCreativeSize(
  value: string | undefined,
): value is PromotionCreativeSize {
  return value === 'small' || value === 'large';
}

// Aspect ratios rarely come out of a design tool perfectly exact — 320x100 exported at 2x can land
// on 640x201. A 1% tolerance absorbs that rounding without letting a genuinely wrong shape through.
const ASPECT_RATIO_TOLERANCE = 0.01;

export interface CreativeDimensions {
  width: number;
  height: number;
}

/**
 * Accepts either the exact target size or any larger image with the same aspect ratio, so a 2x/3x
 * retina export is valid but a differently-shaped image is not. Rejecting anything smaller than the
 * target keeps the popup from rendering an upscaled, blurry creative.
 *
 * Returns null when valid, or a human-readable reason when not.
 */
export function validateCreativeDimensions(
  size: PromotionCreativeSize,
  actual: CreativeDimensions,
): string | null {
  const target = PROMOTION_CREATIVE_SIZES[size];
  if (actual.width === target.width && actual.height === target.height) {
    return null;
  }

  if (actual.width < target.width || actual.height < target.height) {
    return (
      `The ${size} creative (${target.label}) must be at least ${target.width}x${target.height}px — ` +
      `this image is ${actual.width}x${actual.height}px.`
    );
  }

  const targetRatio = target.width / target.height;
  const actualRatio = actual.width / actual.height;
  if (
    Math.abs(actualRatio - targetRatio) / targetRatio >
    ASPECT_RATIO_TOLERANCE
  ) {
    return (
      `The ${size} creative (${target.label}) must match the ${target.width}x${target.height}px aspect ratio — ` +
      `this image is ${actual.width}x${actual.height}px. A larger image is fine as long as it has the same shape.`
    );
  }

  return null;
}
