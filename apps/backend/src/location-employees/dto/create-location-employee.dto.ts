import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class CreateLocationEmployeeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'Shift lead' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @NormalizeEmail()
  // An empty string is a legitimate value (no email on file yet), and @IsEmail would reject it,
  // so the validator only runs when there's actually something to validate.
  @ValidateIf((_object, value) => value !== '')
  @IsEmail()
  email?: string;
}
