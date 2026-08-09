import { ApiProperty } from '@nestjs/swagger';

export class OnboardingLinkDto {
  @ApiProperty({ description: 'Stripe-hosted Connect Express onboarding URL — single-use, short-lived' })
  url: string;
}
