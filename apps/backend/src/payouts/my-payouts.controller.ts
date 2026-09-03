import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OnboardingLinkDto } from './dto/onboarding-link.dto';
import { PayoutDto } from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('Payouts (kiosk-owner)')
@ApiBearerAuth('jwt')
@Controller('my')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.KIOSK_OWNER)
export class MyPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('payouts')
  @ApiOperation({ summary: "The caller's own kiosk's payout history. Never another kiosk's" })
  @ApiResponse({ status: 200, description: "The caller's kiosk's payouts", type: [PayoutDto] })
  findMine(@CurrentUser() currentUser: JwtPayload): Promise<PayoutDto[]> {
    return this.payoutsService.findAllForKiosk(requireKioskId(currentUser));
  }

  @Post('stripe/onboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a Stripe Connect Express onboarding link for the caller\'s own kiosk' })
  @ApiResponse({ status: 200, description: 'Onboarding link', type: OnboardingLinkDto })
  onboard(@CurrentUser() currentUser: JwtPayload): Promise<OnboardingLinkDto> {
    return this.payoutsService.createStripeOnboardingLink(requireKioskId(currentUser));
  }
}

function requireKioskId(user: JwtPayload): string {
  if (!user.kioskId) {
    throw new ForbiddenException('No kiosk associated with this account');
  }
  return user.kioskId;
}
