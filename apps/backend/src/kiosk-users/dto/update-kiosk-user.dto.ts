import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { KIOSK_ASSIGNABLE_ROLES } from './create-kiosk-user.dto';

export class UpdateKioskUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: KIOSK_ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(KIOSK_ASSIGNABLE_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Disable/re-enable this user account' })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  managedLocationIds?: string[];
}
