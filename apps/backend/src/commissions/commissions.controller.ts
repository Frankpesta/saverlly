import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CommissionsService } from './commissions.service';
import { CommissionEventDto } from './dto/commission-event.dto';
import { CommissionEventFilterDto } from './dto/commission-event-filter.dto';
import { SyncNowResultDto } from './dto/sync-now-result.dto';

@ApiTags('Commission Events (admin)')
@ApiBearerAuth('jwt')
@Controller('commission-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @ApiOperation({ summary: 'List commission events across every kiosk, filterable by kiosk/location/merchant/status/date range' })
  @ApiResponse({ status: 200, description: 'Matching commission events', type: [CommissionEventDto] })
  findAll(@Query() filter: CommissionEventFilterDto): Promise<CommissionEventDto[]> {
    return this.commissionsService.findAllForAdmin(filter);
  }

  @Post('sync-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger the commission ingestion + reconciliation job, outside its normal schedule' })
  @ApiResponse({ status: 200, description: 'Counts of what changed', type: SyncNowResultDto })
  syncNow(): Promise<SyncNowResultDto> {
    return this.commissionsService.syncNow();
  }
}
