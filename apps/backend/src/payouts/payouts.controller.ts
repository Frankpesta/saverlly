import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PayoutDto } from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('Payouts (admin)')
@ApiBearerAuth('jwt')
@Controller('payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post(':id/recover')
  @ApiOperation({
    summary:
      'Reconcile a processing payout with Stripe and safely resume a recent interrupted transfer',
  })
  recover(@Param('id') id: string): Promise<PayoutDto> {
    return this.payoutsService.recoverPayout(id);
  }

  @Get()
  @ApiOperation({
    summary:
      'List payouts across every kiosk, with Stripe connection status inlined',
  })
  @ApiResponse({ status: 200, description: 'All payouts', type: [PayoutDto] })
  findAll(): Promise<PayoutDto[]> {
    return this.payoutsService.findAllForAdmin();
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Trigger the Stripe transfer for a pending payout' })
  @ApiResponse({
    status: 200,
    description: 'Payout moved to processing',
    type: PayoutDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Payout is not pending, or the kiosk has no connected Stripe account',
  })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  process(@Param('id') id: string): Promise<PayoutDto> {
    return this.payoutsService.processPayout(id);
  }
}
