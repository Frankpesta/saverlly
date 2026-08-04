import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AttributionMethod } from '@prisma/client';
import { CheckoutRecipeDto } from './checkout-recipe.dto';

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export class CreateMerchantDto {
  @ApiProperty({ example: 'Target' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'target.com' })
  @IsString()
  @Matches(DOMAIN_PATTERN, { message: 'domain must be a valid bare domain, e.g. "target.com"' })
  domain: string;

  @ApiProperty({
    enum: AttributionMethod,
    description: 'Required even if the store has no coupon API at all — this is what makes commission tracking work',
  })
  @IsEnum(AttributionMethod)
  attributionMethod: AttributionMethod;

  @ApiPropertyOptional({ description: 'Required if attributionMethod is COOKIE or BOTH' })
  @ValidateIf(
    (o) =>
      o.affiliateTrackingUrl !== undefined ||
      o.attributionMethod === AttributionMethod.COOKIE ||
      o.attributionMethod === AttributionMethod.BOTH,
  )
  @IsString()
  @MinLength(1)
  affiliateTrackingUrl?: string;

  @ApiPropertyOptional({ example: 'irclickid', description: 'Required if attributionMethod is URL_PARAM or BOTH' })
  @ValidateIf(
    (o) =>
      o.affiliateUrlParamKey !== undefined ||
      o.attributionMethod === AttributionMethod.URL_PARAM ||
      o.attributionMethod === AttributionMethod.BOTH,
  )
  @IsString()
  @MinLength(1)
  affiliateUrlParamKey?: string;

  @ApiPropertyOptional({ description: 'Required if attributionMethod is URL_PARAM or BOTH' })
  @ValidateIf(
    (o) =>
      o.affiliateUrlParamValue !== undefined ||
      o.attributionMethod === AttributionMethod.URL_PARAM ||
      o.attributionMethod === AttributionMethod.BOTH,
  )
  @IsString()
  @MinLength(1)
  affiliateUrlParamValue?: string;

  @ApiPropertyOptional({
    description: 'Optional coupon-sourcing config — connects this merchant to an existing affiliate program',
  })
  @IsOptional()
  @IsUUID()
  affiliateProgramId?: string;

  @ApiPropertyOptional({ type: CheckoutRecipeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutRecipeDto)
  checkoutRecipe?: CheckoutRecipeDto;
}
