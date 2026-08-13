import { ApiProperty } from '@nestjs/swagger';

export type SearchResultType =
  'kiosk' | 'location' | 'device' | 'merchant' | 'coupon' | 'announcement';

export class SearchResultDto {
  @ApiProperty({
    enum: ['kiosk', 'location', 'device', 'merchant', 'coupon', 'announcement'],
  })
  type: SearchResultType;

  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  subtitle: string | null;
}
