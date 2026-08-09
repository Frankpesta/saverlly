import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateAnnouncementDto {
  @ApiPropertyOptional({
    description: 'Required when the caller is ADMIN; ignored for KIOSK_OWNER (their own kioskId is always used)',
  })
  @IsOptional()
  @IsUUID('4')
  kioskId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Location ids to scope this announcement to; empty/omitted = all locations for the kiosk',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @ApiProperty()
  @IsDateString()
  startAt: string;

  @ApiProperty()
  @IsDateString()
  endAt: string;

  @ApiPropertyOptional({ enum: AnnouncementRepeatPolicy, default: AnnouncementRepeatPolicy.ONCE })
  @IsOptional()
  @IsEnum(AnnouncementRepeatPolicy)
  repeatPolicy?: AnnouncementRepeatPolicy;

  @ApiPropertyOptional({
    description:
      'Required (and must be >= 1) when repeatPolicy is MAX_N_TIMES — enforced in AnnouncementsService, ' +
      'since it depends on the resolved repeatPolicy. Whenever supplied, regardless of repeatPolicy, must be a positive integer.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDisplayCount?: number;
}
