import { ApiProperty } from '@nestjs/swagger';

export class BalanceDto {
  @ApiProperty({ description: 'Estimated kiosk share of still-PENDING commission — informational, not withdrawable' })
  pendingAmount: number;

  @ApiProperty({ description: 'Sum of CONFIRMED kioskShareAmount not yet included in a payout — this is the withdrawable balance' })
  confirmedAvailableAmount: number;
}
