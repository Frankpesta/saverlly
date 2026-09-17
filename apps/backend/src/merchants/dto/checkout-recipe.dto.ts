import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeCheckoutSelector } from '@saverlly/shared-types';

const NormalizeSelector = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? normalizeCheckoutSelector(value) : value,
  );

// Structured fields mapping 1:1 to Merchant.checkoutRecipe. The admin console binds a form
// to exactly these fields rather than exposing raw JSON, per 02-PHASE-2's "Merchant Recipe" spec.
export class CheckoutRecipeDto {
  @ApiPropertyOptional({ enum: ['replace', 'remove'] })
  @IsOptional()
  @IsIn(['replace', 'remove'])
  couponApplyMode?: 'replace' | 'remove';

  @ApiPropertyOptional({ example: 'button.remove-promo' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  removeCouponSelector?: string;

  @ApiPropertyOptional({ example: "input[name='promoCode']" })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  couponFieldSelector?: string;

  @ApiPropertyOptional({ example: "button[data-testid='apply-promo']" })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  applyButtonSelector?: string;

  @ApiPropertyOptional({ example: '.promo-success-message' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  successIndicatorSelector?: string;

  @ApiPropertyOptional({ example: '.promo-error-message' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  failureIndicatorSelector?: string;

  @ApiPropertyOptional({ example: '.order-summary-total' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  cartTotalSelector?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['/checkout', '/cart/checkout'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checkoutUrlPatterns?: string[];

  // Some checkouts (e.g. Target) hide the coupon field behind a click-to-reveal button that
  // isn't in the DOM until clicked. See packages/shared-types' CheckoutRecipe for full context.
  @ApiPropertyOptional({ example: 'button#add-promo-code-btn' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  couponFieldRevealSelector?: string;
}
