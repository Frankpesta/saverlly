import { ApiProperty } from '@nestjs/swagger';

export class UploadAnnouncementImageResponseDto {
  @ApiProperty({
    description: 'Absolute URL of the uploaded image — use it as mediaUrl.',
  })
  url: string;
}
