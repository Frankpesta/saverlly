import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BalanceDto } from './dto/balance.dto';
import { CommissionEventDto } from './dto/commission-event.dto';
import { CommissionsService } from './commissions.service';

@ApiTags('Commission Events (kiosk-owner)')
@ApiBearerAuth('jwt')
@Controller('my')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.KIOSK_OWNER)
export class MyCommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('commission-events')
  @ApiOperation({ summary: "The caller's own kiosk's commission events, with status clearly shown — never another kiosk's" })
  @ApiResponse({ status: 200, description: "The caller's kiosk's commission events", type: [CommissionEventDto] })
  findMine(@CurrentUser() currentUser: JwtPayload): Promise<CommissionEventDto[]> {
    return this.commissionsService.findAllForKiosk(requireKioskId(currentUser));
  }

  @Get('balance')
  @ApiOperation({ summary: "The caller's own kiosk's balance split — pending (informational) vs. confirmed-available (withdrawable)" })
  @ApiResponse({ status: 200, description: 'Balance split', type: BalanceDto })
  getBalance(@CurrentUser() currentUser: JwtPayload): Promise<BalanceDto> {
    return this.commissionsService.getBalance(requireKioskId(currentUser));
  }
}

function requireKioskId(user: JwtPayload): string {
  if (!user.kioskId) {
    throw new ForbiddenException('No kiosk associated with this account');
  }
  return user.kioskId;
}
