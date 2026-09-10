import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { LocationEmployeesService } from './location-employees.service';

// Backs the dedicated portal Employees page (kiosk-owner sidebar), which lists the whole roster
// across every location at once rather than one location at a time -- that's what the nested
// /locations/:locationId/employees routes in LocationEmployeesController are for instead.
@ApiTags('Location Employees (kiosk-owner)')
@ApiBearerAuth('jwt')
@Controller('my')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.KIOSK_OWNER)
export class MyLocationEmployeesController {
  constructor(private readonly locationEmployeesService: LocationEmployeesService) {}

  @Get('employees')
  @ApiOperation({ summary: "Every employee across the caller's own kiosk's locations" })
  @ApiResponse({ status: 200, description: "The caller's kiosk's full employee roster" })
  findMine(@CurrentUser() currentUser: JwtPayload) {
    return this.locationEmployeesService.findAllForKiosk(requireKioskId(currentUser));
  }
}

function requireKioskId(user: JwtPayload): string {
  if (!user.kioskId) {
    throw new ForbiddenException('No kiosk associated with this account');
  }
  return user.kioskId;
}
