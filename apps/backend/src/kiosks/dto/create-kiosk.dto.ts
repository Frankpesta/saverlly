import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsMultipleOf } from '../../common/validators/is-multiple-of.decorator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class CreateKioskOwnerDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'owner@kiosk.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

export class CreateKioskDto {
  @ApiProperty({ example: 'Downtown Internet Cafe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 30,
    description:
      'Percentage of commission the kiosk keeps (0-100, in 5% increments)',
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsMultipleOf(5)
  revenueSharePct: number;

  @ApiProperty({
    type: CreateKioskOwnerDto,
    description:
      'The kiosk-owner account created in the same transaction, a password is generated ' +
      'server-side, emailed to them, and returned once in the response for the admin to share.',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateKioskOwnerDto)
  owner: CreateKioskOwnerDto;
}
