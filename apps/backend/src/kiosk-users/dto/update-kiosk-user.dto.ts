import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';
import { KIOSK_ASSIGNABLE_ROLES } from './create-kiosk-user.dto';

export class UpdateKioskUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    example: 'jane@example.com',
    description:
      'Changing this changes the address the account signs in with. Must not already be in use.',
  })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  email?: string;

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
