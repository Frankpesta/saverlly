import { ApiProperty } from '@nestjs/swagger';

export class LifetimeSavingsDto {
  @ApiProperty({ description: 'Sum of confirmed discount amounts across every "applied" coupon-test-event for this device' })
  lifetimeSaved: number;
}
