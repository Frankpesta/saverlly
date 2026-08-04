import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUrl, IsUUID, Min, ValidateNested } from 'class-validator';
import { SelectorConfigDto } from './selector-config.dto';

export class CreateScrapeSourceDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional({ description: 'Leave unset only if this page cannot yet be attributed to one merchant' })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

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
