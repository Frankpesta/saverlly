import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@kiosk.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  password: string;
}
