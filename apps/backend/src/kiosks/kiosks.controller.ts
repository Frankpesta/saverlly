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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  TenantResource,
  TenantResourceType,
} from '../common/decorators/tenant-resource.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { UpdateKioskDto } from './dto/update-kiosk.dto';
import { UpdateKioskStatusDto } from './dto/update-kiosk-status.dto';
import { KiosksService } from './kiosks.service';

@ApiTags('Kiosks')
@ApiBearerAuth('jwt')
@Controller('kiosks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KiosksController {
  constructor(private readonly kiosksService: KiosksService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Create a kiosk and its owner account in one atomic step (admin only, defaults to ' +
      'ACTIVE, no approval step). A password is generated server-side, emailed to the owner, ' +
      'and returned once in the response.',
  })
  @ApiResponse({
    status: 201,
    description: 'Kiosk + owner created, generatedPassword present once',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  create(@Body() dto: CreateKioskDto) {
    return this.kiosksService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all kiosks (admin only)' })
  @ApiResponse({ status: 200, description: 'All kiosks across every tenant' })
  findAll() {
    return this.kiosksService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.KIOSK)
  @ApiOperation({
    summary: 'Get a kiosk by id (admin, or the owning kiosk-owner)',
  })
  @ApiResponse({ status: 200, description: 'The kiosk' })
  @ApiResponse({
    status: 403,
    description: "Not this kiosk's owner and not an admin",
  })
  @ApiResponse({ status: 404, description: 'Kiosk not found' })
  findOne(@Param('id') id: string) {
    return this.kiosksService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Update a kiosk, including revenueSharePct and status (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Kiosk updated' })
  @ApiResponse({ status: 404, description: 'Kiosk not found' })
  update(@Param('id') id: string, @Body() dto: UpdateKioskDto) {
    return this.kiosksService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Toggle a kiosk between ACTIVE and INACTIVE (admin only)',
  })
  @ApiResponse({
    status: 200,
    description:
      "Status updated — takes effect on the kiosk's devices immediately",
  })
  @ApiResponse({ status: 404, description: 'Kiosk not found' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateKioskStatusDto) {
    return this.kiosksService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete a kiosk and everything under it — users, locations, devices, ' +
      'device activity history, kiosk-scoped announcements, and payouts (admin only)',
  })
  @ApiResponse({
    status: 204,
    description: 'Kiosk and everything under it deleted',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'Kiosk not found' })
  remove(@Param('id') id: string) {
    return this.kiosksService.remove(id);
  }
}
