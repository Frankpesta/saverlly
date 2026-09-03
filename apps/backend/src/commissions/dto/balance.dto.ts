import { ApiProperty } from '@nestjs/swagger';

export class BalanceDto {
  @ApiProperty({ description: 'Estimated kiosk share of still-PENDING commission. Informational, not withdrawable' })
  pendingAmount: number;

  @ApiProperty({ description: 'Sum of CONFIRMED kioskShareAmount not yet included in a payout. This is the withdrawable balance' })
  confirmedAvailableAmount: number;
}
