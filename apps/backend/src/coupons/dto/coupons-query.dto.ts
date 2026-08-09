import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CouponsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Page size, 1-100', default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Coupon id to page after (from the previous page\'s last item)' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
