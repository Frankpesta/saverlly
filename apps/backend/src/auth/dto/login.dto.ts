import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class LoginDto {
  @ApiProperty({ example: 'owner@kiosk.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  password: string;
}
