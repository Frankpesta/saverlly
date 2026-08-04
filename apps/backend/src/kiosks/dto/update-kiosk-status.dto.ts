import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { KioskStatus } from '@prisma/client';

export class UpdateKioskStatusDto {
  @ApiProperty({ enum: KioskStatus })
  @IsEnum(KioskStatus)
  status: KioskStatus;
}
