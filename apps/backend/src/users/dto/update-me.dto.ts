import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'me@example.com' })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  email?: string;
}
