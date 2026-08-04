import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  // The kill-switch — kiosk-owner can disable their own devices, admin can disable any.
  @ApiPropertyOptional({ description: 'Kill-switch — false immediately blocks this device\'s token' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
