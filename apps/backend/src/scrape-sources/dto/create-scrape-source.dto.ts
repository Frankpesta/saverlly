import { ApiPropertyOptional } from '@nestjs/swagger';
import { ScrapeStrategy } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUrl,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SelectorConfigDto } from './selector-config.dto';

export class CreateScrapeSourceDto {
  @ApiPropertyOptional({
    enum: ScrapeStrategy,
    default: ScrapeStrategy.GENERIC_CSS,
    description:
      'Which scraper reads the source. GENERIC_CSS uses selectorConfig; a coupon site ' +
      '(SIMPLYCODES, COUPONFOLLOW) needs only a merchant, and its store page URL is built from ' +
      "the merchant's domain when url is omitted.",
  })
  @IsOptional()
  @IsEnum(ScrapeStrategy)
  strategy?: ScrapeStrategy;

  @ApiPropertyOptional({
    description:
      "Required for GENERIC_CSS. For a coupon site, defaults to the merchant's store page.",
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  // Required except for a multi-merchant feed (selectorConfig.rowSelector set), which resolves
  // the merchant per row by exact case-insensitive name instead.
  @ApiPropertyOptional({
    description:
      'The merchant this scrape source belongs to. Required unless selectorConfig.rowSelector ' +
      'is set (a multi-merchant source resolves the merchant per row instead).',
  })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({
    type: SelectorConfigDto,
    description:
      'Required for GENERIC_CSS. Optional overrides for SIMPLYCODES; not used by other sites.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelectorConfigDto)
  selectorConfig?: SelectorConfigDto;

  @ApiPropertyOptional({
    description:
      "Scrape cadence in minutes. Defaults to daily (1440), or the coupon site's own default " +
      '(every 6 hours for sites read without a browser).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;
}
