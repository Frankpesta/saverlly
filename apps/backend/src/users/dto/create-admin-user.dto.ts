import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'jane@saverlly.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
