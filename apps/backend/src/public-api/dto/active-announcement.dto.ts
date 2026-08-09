import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnnouncementRepeatPolicy } from '@prisma/client';

export class ActiveAnnouncementDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional()
  mediaUrl?: string | null;

  @ApiProperty({ enum: AnnouncementRepeatPolicy })
  repeatPolicy: AnnouncementRepeatPolicy;

  @ApiPropertyOptional({ description: 'Set when repeatPolicy is MAX_N_TIMES' })
  maxDisplayCount?: number | null;
}
