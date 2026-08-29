import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { KioskStatus } from '@prisma/client';
import { IsMultipleOf } from '../../common/validators/is-multiple-of.decorator';

export class UpdateKioskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Percentage of commission the kiosk keeps (0-100, in 5% increments)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsMultipleOf(5)
  revenueSharePct?: number;

  @ApiPropertyOptional({ enum: KioskStatus })
  @IsOptional()
  @IsEnum(KioskStatus)
  status?: KioskStatus;
}
