import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { KioskStatus } from '@prisma/client';

export class UpdateKioskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: 'Percentage of commission the kiosk keeps (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  revenueSharePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ enum: KioskStatus })
  @IsOptional()
  @IsEnum(KioskStatus)
  status?: KioskStatus;
}
