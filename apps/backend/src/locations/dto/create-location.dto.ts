import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

// Was US 5-digit-only. Widened per the client's request to also accept ZIP+4 ("12345-6789")
// and letter/dash postal codes like Canada's ("A1A 1A1"): letters, digits, spaces, and dashes,
// 3 to 10 characters, first and last character alphanumeric. Mirrors the frontend's
// ZIP_PATTERN (apps/dashboard/src/lib/validation/schemas.ts) byte-for-byte. Location.zip was
// already a nullable string column for exactly this reason, so no migration is involved.
export const ZIP_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

export class CreateLocationDto {
  @ApiPropertyOptional({
    description: 'Required when the caller is ADMIN; ignored for KIOSK_OWNER (their own kioskId is always used)',
  })
  @IsOptional()
  @IsUUID()
  kioskId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  address: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  city: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  state: string;

  @ApiProperty({ example: '78701', description: 'US ZIP, ZIP+4, or a letter/dash postal code (e.g. Canadian)' })
  @IsString()
  @Matches(ZIP_PATTERN, { message: 'zip must be 3-10 characters: letters, numbers, spaces, and dashes' })
  zip: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ type: [String], example: ['mall', 'downtown', 'high-traffic'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
