import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
  ApiParam,
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
import { CreateKioskUserDto } from './dto/create-kiosk-user.dto';
import { UpdateKioskUserDto } from './dto/update-kiosk-user.dto';
import { KioskUsersService } from './kiosk-users.service';

@ApiTags('Kiosk Users')
@ApiBearerAuth('jwt')
@ApiParam({
  name: 'kioskId',
  description: 'The kiosk these user accounts belong to',
})
@Controller('kiosks/:kioskId/users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
@Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
@TenantResource(TenantResourceType.KIOSK, 'kioskId')
export class KioskUsersController {
  constructor(private readonly kioskUsersService: KioskUsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a user under this kiosk',
    description:
      'Admin can create KIOSK_OWNER or LOCATION_MANAGER accounts. A kiosk-owner may only create ' +
      'LOCATION_MANAGER accounts under their own kiosk — never a peer owner.',
  })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({
    status: 403,
    description:
      'Cross-tenant, or a kiosk-owner attempting to assign a disallowed role',
  })
  create(
    @Param('kioskId') kioskId: string,
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: CreateKioskUserDto,
  ) {
    return this.kioskUsersService.create(kioskId, currentUser.role, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all users belonging to this kiosk' })
  @ApiResponse({
    status: 200,
    description: 'Users under this kiosk (password hashes never included)',
  })
  findAll(@Param('kioskId') kioskId: string) {
    return this.kioskUsersService.findAllForKiosk(kioskId);
  }

  @Patch(':userId')
  @ApiOperation({
    summary: 'Update a kiosk user — role, disabled flag, or managedLocationIds',
  })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({
    status: 403,
    description:
      'Cross-tenant, or a kiosk-owner acting on a non-location-manager account',
  })
  @ApiResponse({
    status: 404,
    description: 'User does not belong to this kiosk',
  })
  update(
    @Param('kioskId') kioskId: string,
    @Param('userId') userId: string,
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UpdateKioskUserDto,
  ) {
    return this.kioskUsersService.update(
      kioskId,
      userId,
      currentUser.role,
      dto,
    );
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a kiosk user' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  @ApiResponse({
    status: 403,
    description:
      'Cross-tenant, a kiosk-owner acting on a non-location-manager account, or deleting your own account',
  })
  @ApiResponse({
    status: 404,
    description: 'User does not belong to this kiosk',
  })
  remove(
    @Param('kioskId') kioskId: string,
    @Param('userId') userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    if (currentUser.sub === userId) {
      throw new ForbiddenException("You can't delete your own account");
    }
    return this.kioskUsersService.remove(kioskId, userId, currentUser.role);
  }
}
