import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const COUPON_TEST_RESULTS = [
  'applied',
  'failed',
  'suppressed_stepdown',
  'no_coupons_available',
] as const;

export class CreateCouponTestEventDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string;

  @ApiPropertyOptional({
    description: 'Nullable — a step-down suppression or a manual trigger with no matching coupon has no couponId',
  })
  @IsOptional()
  @IsUUID()
  couponId?: string;

  @ApiProperty({ enum: COUPON_TEST_RESULTS })
  @IsIn(COUPON_TEST_RESULTS)
  result: (typeof COUPON_TEST_RESULTS)[number];
}
