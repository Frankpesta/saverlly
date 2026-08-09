import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionStatus } from '@prisma/client';

export class CommissionEventDto {
  @ApiProperty() id: string;
  @ApiProperty() deviceId: string;
  @ApiProperty() merchantId: string;
  @ApiPropertyOptional() couponId: string | null;
  @ApiProperty() networkReference: string;
  @ApiProperty() orderValue: number;
  @ApiProperty() commissionAmount: number;
  @ApiProperty({ description: 'Finalized only once status is CONFIRMED; 0 otherwise' })
  kioskShareAmount: number;
  @ApiProperty({ enum: CommissionStatus })
  status: CommissionStatus;
  @ApiProperty() reportedAt: Date;
  @ApiPropertyOptional() confirmedAt: Date | null;
  @ApiPropertyOptional() reversedAt: Date | null;
  @ApiPropertyOptional() payoutId: string | null;
}
