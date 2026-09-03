import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MinLength,
} from 'class-validator';

/**
 * validator.js requires a TLD by default, which rejects `http://localhost:3000/...`. Exactly the
 * URL our own POST /promotions/upload-image hands back in local development. Without this the
 * upload→create round trip is impossible on a dev machine even though both halves work.
 */
const URL_OPTIONS = { require_tld: false };

export class CreatePromotionDto {
  @ApiProperty({
    description:
      'Internal label used to identify this promotion in the admin list. Never shown to shoppers.',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description:
      'Absolute URL of the 320x100 creative, rendered in the extension popup. Get one from POST /promotions/upload-image?size=small.',
  })
  @IsUrl(URL_OPTIONS)
  imageSmallUrl: string;

  @ApiProperty({
    description:
      'Absolute URL of the 728x90 creative, held for the future on-page banner surface. Get one from POST /promotions/upload-image?size=large.',
  })
  @IsUrl(URL_OPTIONS)
  imageLargeUrl: string;

  @ApiProperty({
    description: 'Where the shopper lands when they click the promotion.',
  })
  @IsUrl(URL_OPTIONS)
  clickUrl: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Location tags to target, matched against Location.tags. Combined with locationIds as a ' +
      'union (either may match), not an intersection. Both empty = show on every device.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetTags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Specific location ids to target. Combined with targetTags as a union. See above.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  @ApiProperty()
  @IsDateString()
  startAt: string;

  @ApiProperty()
  @IsDateString()
  endAt: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Manual kill switch, independent of the startAt/endAt window. Set false to pull a promotion ' +
      'without editing its schedule.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
