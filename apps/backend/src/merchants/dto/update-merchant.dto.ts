import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AttributionMethod } from '@prisma/client';
import { CheckoutRecipeDto } from './checkout-recipe.dto';

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export class UpdateMerchantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'target.com' })
  @IsOptional()
  @IsString()
  @Matches(DOMAIN_PATTERN, { message: 'domain must be a valid bare domain, e.g. "target.com"' })
  domain?: string;

  @ApiPropertyOptional({ enum: AttributionMethod })
  @IsOptional()
  @IsEnum(AttributionMethod)
  attributionMethod?: AttributionMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  affiliateTrackingUrl?: string;

  @ApiPropertyOptional({ example: 'irclickid' })
  @IsOptional()
  @IsString()
  affiliateUrlParamKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  affiliateUrlParamValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  affiliateProgramId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: CheckoutRecipeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutRecipeDto)
  checkoutRecipe?: CheckoutRecipeDto;
}
