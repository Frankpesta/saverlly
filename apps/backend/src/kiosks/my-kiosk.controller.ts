import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { KiosksService } from './kiosks.service';

@ApiTags('Kiosks (portal)')
@ApiBearerAuth('jwt')
@Controller('my')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
export class MyKioskController {
  constructor(private readonly kiosksService: KiosksService) {}

  @Get('kiosk-contact')
  @ApiOperation({
    summary:
      "The caller's own kiosk owner's name and email — there's no separate kiosk contact field, the owner's own account is the contact",
  })
  @ApiResponse({ status: 200, description: 'Owner contact' })
  findContact(@CurrentUser() currentUser: JwtPayload) {
    if (!currentUser.kioskId) {
      throw new ForbiddenException('No kiosk associated with this account');
    }
    return this.kiosksService.findOwnerContact(currentUser.kioskId);
  }
}
