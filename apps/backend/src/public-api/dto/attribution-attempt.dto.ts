import { ApiProperty } from '@nestjs/swagger';

export class AttributionAttemptDto {
  @ApiProperty({ description: 'Mint into the merchant\'s affiliateSubIdParamKey query param' })
  subId: string;
}
