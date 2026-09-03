import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAffiliateProgramDto {
  @ApiProperty({ example: 'Impact', description: 'e.g. "Impact", "CJ Affiliate", "Rakuten"' })
  @IsString()
  @MinLength(1)
  networkName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiPropertyOptional({
    description: 'Raw credentials (e.g. { apiKey, apiSecret }). Encrypted before storage, never returned by any read endpoint',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  apiCredentials?: Record<string, string>;

  @ApiProperty({ description: 'Explicit flag: can this program feed coupon codes automatically?' })
  @IsBoolean()
  hasCouponApi: boolean;
}
