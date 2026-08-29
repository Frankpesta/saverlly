import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the reset-password email link' })
  @IsString()
  token: string;

  @ApiProperty({ writeOnly: true, minLength: 8 })
  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
