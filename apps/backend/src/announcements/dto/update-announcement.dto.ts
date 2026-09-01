import { ApiPropertyOptional } from '@nestjs/swagger';
import { AnnouncementRepeatPolicy } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';
import { IsAnnouncementLayout } from './is-announcement-layout.validator';

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Freeform canvas design (AnnouncementLayout). See CreateAnnouncementDto.layout.',
  })
  @IsOptional()
  @IsAnnouncementLayout()
  layout?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ enum: AnnouncementRepeatPolicy })
  @IsOptional()
  @IsEnum(AnnouncementRepeatPolicy)
  repeatPolicy?: AnnouncementRepeatPolicy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDisplayCount?: number;
}
