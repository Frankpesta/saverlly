import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUrl, IsUUID, Min, ValidateNested } from 'class-validator';
import { SelectorConfigDto } from './selector-config.dto';

export class CreateScrapeSourceDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  url: string;

  // Required for now: the scrape processor has no per-extracted-item merchant resolution
  // strategy, so a merchant-less source would be accepted but silently never produce coupons.
  // Schema/relation stay nullable for when that resolution strategy is actually built.
  @ApiProperty({ description: 'The merchant this scrape source belongs to' })
  @IsUUID()
  merchantId: string;

  @ApiProperty({ type: SelectorConfigDto })
  @ValidateNested()
  @Type(() => SelectorConfigDto)
  selectorConfig: SelectorConfigDto;

  @ApiPropertyOptional({ default: 1440, description: 'Scrape cadence in minutes — defaults to daily (1440)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;
}
