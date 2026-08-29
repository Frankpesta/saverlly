import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  currentPassword: string;

  @ApiProperty({ writeOnly: true, minLength: 8 })
  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
