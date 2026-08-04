import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

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

  @ApiProperty()
  @IsString()
  @MinLength(1)
  country: string;

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
