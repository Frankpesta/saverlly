import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

// A kiosk's own users are always KIOSK_OWNER or LOCATION_MANAGER — ADMIN is never kiosk-scoped.
export const KIOSK_ASSIGNABLE_ROLES = [UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER] as const;

export class CreateKioskUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ writeOnly: true, minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: KIOSK_ASSIGNABLE_ROLES })
  @IsIn(KIOSK_ASSIGNABLE_ROLES)
  role: UserRole;

  @ApiPropertyOptional({
    type: [String],
    description: 'Location ids this user manages — only meaningful for LOCATION_MANAGER',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  managedLocationIds?: string[];
}
