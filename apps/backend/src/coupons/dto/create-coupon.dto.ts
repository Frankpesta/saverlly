import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const DISCOUNT_TYPES = ['percent', 'fixed', 'unknown'] as const;

export class CreateCouponDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string;

  @ApiProperty({ example: 'SAVE20' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DISCOUNT_TYPES })
  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  discountType?: (typeof DISCOUNT_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  discountValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
