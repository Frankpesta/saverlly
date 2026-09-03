import { ApiProperty } from '@nestjs/swagger';

export class UploadAnnouncementImageResponseDto {
  @ApiProperty({
    description: 'Absolute URL of the uploaded image. Use it as mediaUrl.',
  })
  url: string;
}
