import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MintAttributionAttemptDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string;
}
