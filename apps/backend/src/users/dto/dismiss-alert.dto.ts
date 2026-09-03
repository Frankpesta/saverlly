import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DismissAlertDto {
  @ApiProperty({
    example: 'kiosk-inactive:9c3f1e2a-...',
    description:
      "Stable id the frontend derives per Overview 'Needs attention' item, e.g. 'kiosk-inactive:<kioskId>' or 'payouts-pending'",
  })
  @IsString()
  @MinLength(1)
  alertKey: string;
}
