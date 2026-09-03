import { ApiProperty } from '@nestjs/swagger';
import { CommissionStatus } from '@prisma/client';

export class CommissionEventDto {
  @ApiProperty() id: string;
  @ApiProperty() deviceId: string;
  @ApiProperty() merchantId: string;
  // Always present in the response (never omitted) but may be null. Nullable:true,
  // not ApiPropertyOptional, since "optional" in OpenAPI means possibly-absent.
  @ApiProperty({ nullable: true, type: String }) couponId: string | null;
  @ApiProperty() networkReference: string;
  @ApiProperty() orderValue: number;
  @ApiProperty() commissionAmount: number;
  @ApiProperty({ description: 'Finalized only once status is CONFIRMED; 0 otherwise' })
  kioskShareAmount: number;
  @ApiProperty({ enum: CommissionStatus })
  status: CommissionStatus;
  @ApiProperty() reportedAt: Date;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) confirmedAt: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) reversedAt: Date | null;
  @ApiProperty({ nullable: true, type: String }) payoutId: string | null;
}
