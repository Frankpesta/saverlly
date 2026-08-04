import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNumber, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateKioskDto {
  @ApiProperty({ example: 'Downtown Internet Cafe' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 30, description: 'Percentage of commission the kiosk keeps (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  revenueSharePct: number;

  @ApiProperty({ example: 'owner@kiosk.com' })
  @IsEmail()
  contactEmail: string;
}
