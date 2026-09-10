import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SelectorConfigDto {
  @ApiProperty({ description: 'CSS selector matching each coupon code element on the page', example: '.coupon-code' })
  @IsString()
  @MinLength(1)
  codeSelector: string;

  @ApiPropertyOptional({ description: 'CSS selector for a description near each code, if present' })
  @IsOptional()
  @IsString()
  descriptionSelector?: string;

  @ApiPropertyOptional({
    description:
      'CSS selector matching a "reveal"/"get code" button that must be clicked before the code ' +
      'becomes visible in the page. Only needed on sites that hide the code behind a click.',
    example: '.reveal-code-button',
  })
  @IsOptional()
  @IsString()
  revealSelector?: string;
}
