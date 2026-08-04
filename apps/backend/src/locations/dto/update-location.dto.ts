import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  country?: string;

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
