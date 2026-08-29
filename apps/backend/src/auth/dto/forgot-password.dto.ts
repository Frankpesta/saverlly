import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'owner@kiosk.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
