import { ApiProperty } from '@nestjs/swagger';

export class UploadPromotionImageResponseDto {
  @ApiProperty({
    description:
      'Absolute URL of the uploaded image — use it as imageSmallUrl or imageLargeUrl.',
  })
  url: string;

  @ApiProperty({ description: 'Detected pixel width of the uploaded image.' })
  width: number;

  @ApiProperty({ description: 'Detected pixel height of the uploaded image.' })
  height: number;
}
