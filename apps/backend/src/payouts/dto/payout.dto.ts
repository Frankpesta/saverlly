import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayoutKioskDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'True once the kiosk has connected a Stripe account (may still be mid-onboarding)' })
  stripeConnected: boolean;
  @ApiProperty({ description: 'True once Stripe onboarding is fully complete and the account can receive transfers' })
  stripePayoutsEnabled: boolean;
}

export class PayoutDto {
  @ApiProperty() id: string;
  @ApiProperty() kioskId: string;
  @ApiPropertyOptional({ description: 'Admin listing only' })
  kiosk?: PayoutKioskDto;
  @ApiProperty() periodStart: Date;
  @ApiProperty() periodEnd: Date;
  @ApiProperty() totalAmount: number;
  @ApiProperty({ enum: ['pending', 'processing', 'paid', 'failed'] })
  status: string;
  // Always present in the response (never omitted) but may be null. Nullable:true,
  // not ApiPropertyOptional, since "optional" in OpenAPI means possibly-absent.
  @ApiProperty({ nullable: true, type: String }) stripeTransferId: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) paidAt: Date | null;
  @ApiProperty() createdAt: Date;
}
