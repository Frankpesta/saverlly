import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantResource, TenantResourceType } from '../common/decorators/tenant-resource.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('Announcements')
@ApiBearerAuth('jwt')
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @ApiOperation({ summary: 'Create an announcement (admin specifies kioskId; kiosk-owner\'s own kiosk is implied)' })
  @ApiResponse({ status: 201, description: 'Announcement created' })
  create(@CurrentUser() currentUser: JwtPayload, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(currentUser, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @ApiOperation({
    summary: 'List announcements',
    description:
      'Admin sees all announcements; kiosk-owner sees their own kiosk\'s announcements; ' +
      'location-manager sees only announcements scoped to all locations or overlapping their assigned locations.',
  })
  @ApiResponse({ status: 200, description: 'Announcements visible to the caller' })
  findAll(@CurrentUser() currentUser: JwtPayload) {
    return this.announcementsService.findAll(currentUser);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.ANNOUNCEMENT)
  @ApiOperation({ summary: 'Get an announcement by id' })
  @ApiResponse({ status: 200, description: 'The announcement' })
  @ApiResponse({ status: 403, description: 'Not in the caller\'s tenant scope' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  findOne(@Param('id') id: string) {
    return this.announcementsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.ANNOUNCEMENT)
  @ApiOperation({ summary: 'Update an announcement' })
  @ApiResponse({ status: 200, description: 'Announcement updated' })
  @ApiResponse({ status: 403, description: 'Not in the caller\'s tenant scope' })
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.ANNOUNCEMENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an announcement' })
  @ApiResponse({ status: 204, description: 'Announcement deleted' })
  @ApiResponse({ status: 403, description: 'Not allowed for this role or tenant' })
  remove(@Param('id') id: string) {
    return this.announcementsService.remove(id);
  }
}
