import { ApiProperty } from '@nestjs/swagger';
import { KioskStatus } from '@prisma/client';

export class DeviceStatusDto {
  @ApiProperty({ enum: KioskStatus, description: 'Status of the kiosk this device belongs to' })
  kioskStatus: KioskStatus;

  @ApiProperty({ description: 'Whether this specific device is enabled (kill-switch)' })
  deviceActive: boolean;
}
