import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CommissionEventFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  kioskId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ enum: CommissionStatus })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiPropertyOptional({ description: 'ISO date-time — only events reported at or after this' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date-time — only events reported at or before this' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
