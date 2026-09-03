import { ApiProperty } from '@nestjs/swagger';

export class ActivePromotionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    description: '320x100 creative, rendered in the extension popup',
  })
  imageSmallUrl: string;

  @ApiProperty({
    description:
      '728x90 leaderboard creative. Returned so the future on-page banner surface needs no API change',
  })
  imageLargeUrl: string;

  @ApiProperty({ description: 'Where the shopper lands on click' })
  clickUrl: string;
}
