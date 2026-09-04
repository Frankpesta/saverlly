import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, ValidateIf } from 'class-validator';
import { NormalizeEmail } from '../../common/transformers/normalize-email.decorator';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({
    example: 'support@saverlly.com',
    description:
      'The address the kiosk portal points owners and managers at. Send an empty string to ' +
      'clear it, which makes the portal render the text unlinked.',
  })
  @IsOptional()
  @NormalizeEmail()
  // An empty string is a legitimate value here (it clears the setting), and @IsEmail would
  // reject it, so the validator only runs when there is something to validate.
  @ValidateIf((_object, value) => value !== '')
  @IsEmail()
  supportEmail?: string;
}
