import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUrl, IsUUID, Min, ValidateNested } from 'class-validator';
import { SelectorConfigDto } from './selector-config.dto';

export class UpdateScrapeSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  // Explicit null (not just omitted) is a real, meaningful value here -- it's how an existing
  // single-merchant source gets converted to multi-merchant (selectorConfig.rowSelector set)
  // and clears its old fixed merchantId. @IsOptional() already treats null the same as omitted
  // (skips @IsUUID()), so this only widens the type to say what was already true at runtime.
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  merchantId?: string | null;

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
