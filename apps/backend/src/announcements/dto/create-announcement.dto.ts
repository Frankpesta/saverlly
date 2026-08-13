import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnnouncementRepeatPolicy } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
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
    description:
      'Which kiosk this announcement belongs to. Required for ADMIN unless `broadcast` is true; ' +
      'ignored for KIOSK_OWNER (their own kioskId is always used).',
  })
  @IsOptional()
  @IsUUID('4')
  kioskId?: string;

  @ApiPropertyOptional({
    description:
      'ADMIN-only: create a platform-wide broadcast shown on every device across every kiosk, instead of ' +
      'one kiosk. An explicit flag rather than inferring broadcast from an omitted kioskId, since a forgotten ' +
      'kioskId silently becoming "show to everyone" is too large a blast radius for an implicit default. ' +
      'When true, kioskId and locationIds are ignored — a broadcast always targets everyone.',
  })
  @IsOptional()
  @IsBoolean()
  broadcast?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Location ids to scope this announcement to; empty/omitted = all locations for the kiosk',
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

  @ApiPropertyOptional({
    enum: AnnouncementRepeatPolicy,
    default: AnnouncementRepeatPolicy.ONCE,
  })
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
