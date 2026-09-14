import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUrl, IsUUID, Min, ValidateNested } from 'class-validator';
import { SelectorConfigDto } from './selector-config.dto';

export class CreateScrapeSourceDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  url: string;

  // Required except for a multi-merchant source (selectorConfig.rowSelector set) -- the
  // processor now has a per-row merchant resolution strategy (exact case-insensitive name
  // match) for that case, and a fixed merchantId would be meaningless there since each row
  // belongs to a different merchant. The processor itself is the real enforcement point for
  // "one or the other, not neither/both" -- see its merchantId/rowSelector branch.
  @ApiPropertyOptional({
    description:
      'The merchant this scrape source belongs to. Required unless selectorConfig.rowSelector ' +
      'is set (a multi-merchant source resolves the merchant per row instead).',
  })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiProperty({ type: SelectorConfigDto })
  @ValidateNested()
  @Type(() => SelectorConfigDto)
  selectorConfig: SelectorConfigDto;

  @ApiPropertyOptional({ default: 1440, description: 'Scrape cadence in minutes. Defaults to daily (1440)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;
}
