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

// US 5-digit ZIP only. A prior round briefly widened this to also accept ZIP+4 and
// letter/dash postal codes (e.g. Canadian), but that reversed what was actually asked for —
// back to plain 5-digit-numeric. Letters/dashes/ZIP+4 may come back later if the client asks
// for it again; Location.zip is a nullable string column either way, so no migration is
// involved in either direction. Mirrors the frontend's ZIP_PATTERN
// (apps/dashboard/src/lib/validation/schemas.ts) byte-for-byte.
export const ZIP_PATTERN = /^\d{5}$/;

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

  @ApiProperty({ example: '78701', description: 'US 5-digit ZIP code' })
  @IsString()
  @Matches(ZIP_PATTERN, { message: 'zip must be exactly 5 digits' })
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
