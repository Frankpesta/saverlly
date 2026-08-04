import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantResource, TenantResourceType } from '../common/decorators/tenant-resource.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // Machine-initiated, no human auth — gated by setup code validity instead, and rate-limited
  // to blunt brute-force guessing of setup codes.
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Machine-initiated device registration',
    description:
      'No human auth — gated by a valid, active LocationSetupCode whose parent kiosk is ACTIVE. ' +
      'Returns a device token immediately, no approval step. Rate-limited (5/min) to blunt setup-code guessing.',
  })
  @ApiResponse({ status: 201, description: 'Device registered; token returned once, store it — it is not retrievable again' })
  @ApiResponse({ status: 400, description: 'Setup code invalid/inactive, or parent kiosk not ACTIVE' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  register(@Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'List devices',
    description:
      'Admin sees all devices; kiosk-owner sees their own kiosk\'s devices; ' +
      'location-manager sees only devices at their assigned locations.',
  })
  @ApiResponse({ status: 200, description: 'Devices visible to the caller' })
  findAll(@CurrentUser() currentUser: JwtPayload) {
    return this.devicesService.findAll(currentUser);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @TenantResource(TenantResourceType.DEVICE)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get a device by id' })
  @ApiResponse({ status: 200, description: 'The device' })
  @ApiResponse({ status: 403, description: 'Not in the caller\'s tenant scope' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @TenantResource(TenantResourceType.DEVICE)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Update a device, including the active kill-switch' })
  @ApiResponse({ status: 200, description: 'Device updated — active:false blocks its token on next use' })
  @ApiResponse({ status: 403, description: 'Not in the caller\'s tenant scope' })
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @TenantResource(TenantResourceType.DEVICE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Delete a device and revoke its tokens (admin or kiosk-owner only)' })
  @ApiResponse({ status: 204, description: 'Device deleted' })
  @ApiResponse({ status: 403, description: 'Not allowed for this role or tenant' })
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
