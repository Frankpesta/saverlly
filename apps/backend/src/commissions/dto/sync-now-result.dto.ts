import { ApiProperty } from '@nestjs/swagger';

export class SyncNowResultDto {
  @ApiProperty({ description: 'New CommissionEvents created (PENDING, or immediately CONFIRMED/REVERSED)' })
  ingested: number;

  @ApiProperty({ description: 'Previously-PENDING events transitioned to CONFIRMED' })
  confirmed: number;

  @ApiProperty({ description: 'Previously-PENDING events transitioned to REVERSED' })
  reversed: number;
}
