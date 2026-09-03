import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementRepeatPolicy } from '@prisma/client';
import type { AnnouncementLayout } from '@saverlly/shared-types';

export class ActiveAnnouncementDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  // Always present in the response (never omitted) but may be null. Nullable:true,
  // not ApiPropertyOptional, since "optional" in OpenAPI means possibly-absent.
  @ApiProperty({ nullable: true, type: String })
  mediaUrl: string | null;

  @ApiProperty({ enum: AnnouncementRepeatPolicy })
  repeatPolicy: AnnouncementRepeatPolicy;

  @ApiProperty({ nullable: true, type: Number, description: 'Set when repeatPolicy is MAX_N_TIMES' })
  maxDisplayCount: number | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description:
      'Freeform canvas design (AnnouncementLayout). Null for announcements authored before the ' +
      'canvas editor. The agent renders a default layout from title/body/mediaUrl in that case.',
  })
  layout: AnnouncementLayout | null;
}
