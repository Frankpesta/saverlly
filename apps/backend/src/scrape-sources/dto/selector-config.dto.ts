import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { IsCssSelector } from '../../common/validators/is-css-selector.decorator';

export class SelectorConfigDto {
  @ApiProperty({
    description: 'CSS selector matching each coupon code element on the page',
    example: '.coupon-code',
  })
  @IsString()
  @MinLength(1)
  @IsCssSelector()
  codeSelector: string;

  @ApiPropertyOptional({
    description: 'CSS selector for a description near each code, if present',
  })
  @IsOptional()
  @IsString()
  @IsCssSelector()
  descriptionSelector?: string;

  @ApiPropertyOptional({
    description:
      'CSS selector matching a "reveal"/"get code" button that must be clicked before the code ' +
      'becomes visible in the page. Only needed on sites that hide the code behind a click.',
    example: '.reveal-code-button',
  })
  @IsOptional()
  @IsString()
  @IsCssSelector()
  revealSelector?: string;

  @ApiPropertyOptional({
    description:
      'CSS selector matching each row container on a multi-merchant page (e.g. a site-wide ' +
      '"recently verified" feed covering many stores in one page, rather than one store per ' +
      'page). When set, this source must omit merchantId on the ScrapeSource itself -- ' +
      'codeSelector and merchantSelector are then evaluated per-row (scoped to each row element, ' +
      'not the whole page) and the merchant is resolved by exact case-insensitive name match ' +
      'against existing merchants; rows with no match are skipped rather than guessed.',
    example: '.feed-entry',
  })
  @IsOptional()
  @IsString()
  @IsCssSelector()
  rowSelector?: string;

  @ApiPropertyOptional({
    description:
      'CSS selector for the merchant name within a rowSelector row. Required together with ' +
      'rowSelector; meaningless without it.',
    example: '.feed-merchant',
  })
  @IsOptional()
  @IsString()
  @IsCssSelector()
  merchantSelector?: string;
}
