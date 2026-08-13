import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({
    description:
      'Search text. Fewer than 2 characters yields an empty result set.',
  })
  @IsString()
  @MaxLength(100)
  q: string;
}
