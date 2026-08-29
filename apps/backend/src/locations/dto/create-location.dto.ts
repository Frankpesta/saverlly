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

// US 5-digit ZIP only, for now — the client has said they want to allow letters/dashes later
// (e.g. Canadian postal codes), so this stays a single regex swap, not a schema change.
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

  @ApiProperty({ example: '78701', description: 'US 5-digit ZIP' })
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
