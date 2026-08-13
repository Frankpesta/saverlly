import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { RolesGuard } from '../common/guards/roles.guard';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResultDto } from './dto/search-result.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('jwt')
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @ApiOperation({
    summary:
      'Search across kiosks, locations, devices, merchants, coupons, and announcements',
    description:
      "Results are scoped by the caller's role and tenant, identically to each entity's own list " +
      'endpoint — kiosks/merchants/coupons are admin-only, locations/devices/announcements are scoped ' +
      "to the caller's own kiosk or assigned locations.",
  })
  @ApiResponse({
    status: 200,
    description: 'Matching results visible to the caller',
    type: [SearchResultDto],
  })
  search(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultDto[]> {
    return this.searchService.search(currentUser, query.q);
  }
}
