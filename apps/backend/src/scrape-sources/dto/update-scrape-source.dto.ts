import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUrl, IsUUID, Min, ValidateNested } from 'class-validator';
import { SelectorConfigDto } from './selector-config.dto';

export class UpdateScrapeSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({ type: SelectorConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelectorConfigDto)
  selectorConfig?: SelectorConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
