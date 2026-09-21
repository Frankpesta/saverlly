import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ArrayNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeCheckoutSelector } from '@saverlly/shared-types';
import { IsCssSelector } from '../../common/validators/is-css-selector.decorator';

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

  @ApiPropertyOptional({
    example: 'button.remove-promo',
    description: 'Required and nonblank when couponApplyMode is remove.',
  })
  @ValidateIf(
    (recipe: CheckoutRecipeDto) =>
      recipe.couponApplyMode === 'remove' ||
      (recipe.removeCouponSelector != null &&
        recipe.removeCouponSelector !== ''),
  )
  @IsString()
  @Matches(/\S/, {
    message:
      'removeCouponSelector must be nonblank when supplied; it is required for remove mode',
  })
  @NormalizeSelector()
  @IsCssSelector()
  removeCouponSelector?: string;

  @ApiProperty({ example: "input[name='promoCode']" })
  @IsString()
  @NormalizeSelector()
  @IsCssSelector()
  couponFieldSelector: string;

  @ApiProperty({ example: "button[data-testid='apply-promo']" })
  @IsString()
  @NormalizeSelector()
  @IsCssSelector()
  applyButtonSelector: string;

  @ApiPropertyOptional({ example: '.promo-success-message' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  @IsCssSelector()
  successIndicatorSelector?: string;

  @ApiPropertyOptional({ example: '.promo-error-message' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  @IsCssSelector()
  failureIndicatorSelector?: string;

  @ApiProperty({ example: '.order-summary-total' })
  @IsString()
  @NormalizeSelector()
  @IsCssSelector()
  cartTotalSelector: string;

  @ApiProperty({
    type: [String],
    example: ['/checkout', '/cart/checkout'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  checkoutUrlPatterns: string[];

  // Some checkouts (e.g. Target) hide the coupon field behind a click-to-reveal button that
  // isn't in the DOM until clicked. See packages/shared-types' CheckoutRecipe for full context.
  @ApiPropertyOptional({ example: 'button#add-promo-code-btn' })
  @IsOptional()
  @IsString()
  @NormalizeSelector()
  @IsCssSelector()
  couponFieldRevealSelector?: string;
}
