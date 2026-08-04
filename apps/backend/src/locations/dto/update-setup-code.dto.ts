import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateSetupCodeDto {
  @ApiProperty({ description: 'Set false to revoke the code, true to reactivate it' })
  @IsBoolean()
  active: boolean;
}
