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
import { IsAnnouncementLayout } from './is-announcement-layout.validator';

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
  // require_tld:false so `http://localhost:3000/uploads/...` — what our own
  // POST /announcements/upload-image returns in local dev — is accepted. validator.js rejects
  // any host without a TLD by default, which would make the upload→create round trip impossible
  // on a dev machine. Same reasoning as CreatePromotionDto.
  @IsUrl({ require_tld: false })
  mediaUrl?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Freeform canvas design produced by the portal editor (AnnouncementLayout). Omit for a ' +
      'plain title/body/image announcement — the kiosk agent then renders a default layout built ' +
      'from those fields instead.',
  })
  @IsOptional()
  @IsAnnouncementLayout()
  layout?: unknown;

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
