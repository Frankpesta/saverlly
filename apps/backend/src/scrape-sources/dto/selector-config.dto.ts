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
}
