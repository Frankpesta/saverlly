import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementRepeatPolicy } from '@prisma/client';

export class ActiveAnnouncementDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  // Always present in the response (never omitted) but may be null — nullable:true,
  // not ApiPropertyOptional, since "optional" in OpenAPI means possibly-absent.
  @ApiProperty({ nullable: true, type: String })
  mediaUrl: string | null;

  @ApiProperty({ enum: AnnouncementRepeatPolicy })
  repeatPolicy: AnnouncementRepeatPolicy;

  @ApiProperty({ nullable: true, type: Number, description: 'Set when repeatPolicy is MAX_N_TIMES' })
  maxDisplayCount: number | null;
}
