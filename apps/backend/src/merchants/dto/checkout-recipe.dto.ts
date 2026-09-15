import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

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
  removeCouponSelector?: string;

  @ApiPropertyOptional({ example: "input[name='promoCode']" })
  @IsOptional()
  @IsString()
  couponFieldSelector?: string;

  @ApiPropertyOptional({ example: "button[data-testid='apply-promo']" })
  @IsOptional()
  @IsString()
  applyButtonSelector?: string;

  @ApiPropertyOptional({ example: '.promo-success-message' })
  @IsOptional()
  @IsString()
  successIndicatorSelector?: string;

  @ApiPropertyOptional({ example: '.promo-error-message' })
  @IsOptional()
  @IsString()
  failureIndicatorSelector?: string;

  @ApiPropertyOptional({ example: '.order-summary-total' })
  @IsOptional()
  @IsString()
  cartTotalSelector?: string;

  @ApiPropertyOptional({ type: [String], example: ['/checkout', '/cart/checkout'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checkoutUrlPatterns?: string[];

  // Some checkouts (e.g. Target) hide the coupon field behind a click-to-reveal button that
  // isn't in the DOM until clicked. See packages/shared-types' CheckoutRecipe for full context.
  @ApiPropertyOptional({ example: "button#add-promo-code-btn" })
  @IsOptional()
  @IsString()
  couponFieldRevealSelector?: string;
}
