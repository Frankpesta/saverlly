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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import {
  TenantResource,
  TenantResourceType,
} from '../common/decorators/tenant-resource.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateSetupCodeDto } from './dto/update-setup-code.dto';
import { LocationsService } from './locations.service';

@ApiTags('Locations')
@ApiBearerAuth('jwt')
@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @ApiOperation({
    summary:
      "Create a location (admin specifies kioskId; kiosk-owner's own kiosk is implied)",
  })
  @ApiResponse({ status: 201, description: 'Location created' })
  create(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.create(currentUser, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @ApiOperation({
    summary: 'List locations',
    description:
      "Admin sees all locations; kiosk-owner sees their own kiosk's locations; " +
      'location-manager sees only their assigned locations.',
  })
  @ApiResponse({ status: 200, description: 'Locations visible to the caller' })
  findAll(@CurrentUser() currentUser: JwtPayload) {
    return this.locationsService.findAll(currentUser);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.LOCATION)
  @ApiOperation({ summary: 'Get a location by id' })
  @ApiResponse({ status: 200, description: 'The location' })
  @ApiResponse({ status: 403, description: "Not in the caller's tenant scope" })
  @ApiResponse({ status: 404, description: 'Location not found' })
  findOne(@Param('id') id: string) {
    return this.locationsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.LOCATION)
  @ApiOperation({ summary: 'Update a location, including tags' })
  @ApiResponse({ status: 200, description: 'Location updated' })
  @ApiResponse({ status: 403, description: "Not in the caller's tenant scope" })
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.LOCATION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Delete a location (admin or kiosk-owner only, not location-manager) — cascades to its setup codes, devices, and each device's own history",
  })
  @ApiResponse({
    status: 204,
    description: 'Location and everything under it deleted',
  })
  @ApiResponse({
    status: 403,
    description: 'Not allowed for this role or tenant',
  })
  remove(@Param('id') id: string) {
    return this.locationsService.remove(id);
  }

  @Post(':id/setup-codes')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.LOCATION)
  @ApiOperation({
    summary: 'Generate a new reusable device setup code for this location',
  })
  @ApiResponse({ status: 201, description: 'Setup code created' })
  createSetupCode(@Param('id') id: string) {
    return this.locationsService.createSetupCode(id);
  }

  @Get(':id/setup-codes')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.LOCATION)
  @ApiOperation({ summary: 'List setup codes for this location' })
  @ApiResponse({ status: 200, description: 'Setup codes' })
  findSetupCodes(@Param('id') id: string) {
    return this.locationsService.findSetupCodes(id);
  }

  @Patch(':id/setup-codes/:codeId')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.LOCATION)
  @ApiOperation({ summary: 'Revoke or reactivate a setup code' })
  @ApiResponse({ status: 200, description: 'Setup code updated' })
  @ApiResponse({
    status: 404,
    description: 'Setup code does not belong to this location',
  })
  updateSetupCode(
    @Param('id') id: string,
    @Param('codeId') codeId: string,
    @Body() dto: UpdateSetupCodeDto,
  ) {
    return this.locationsService.updateSetupCode(id, codeId, dto.active);
  }
}
