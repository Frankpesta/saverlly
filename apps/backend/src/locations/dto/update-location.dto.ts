import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ZIP_PATTERN } from './create-location.dto';

export class UpdateLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  state?: string;

  @ApiPropertyOptional({ example: '78701', description: 'US 5-digit ZIP' })
  @IsOptional()
  @IsString()
  @Matches(ZIP_PATTERN, { message: 'zip must be exactly 5 digits' })
  zip?: string;

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
