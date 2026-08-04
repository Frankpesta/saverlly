import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AffiliateProgramsService } from './affiliate-programs.service';
import { CreateAffiliateProgramDto } from './dto/create-affiliate-program.dto';
import { UpdateAffiliateProgramDto } from './dto/update-affiliate-program.dto';

@ApiTags('Affiliate Programs')
@ApiBearerAuth('jwt')
@Controller('affiliate-programs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AffiliateProgramsController {
  constructor(private readonly affiliateProgramsService: AffiliateProgramsService) {}

  @Post()
  @ApiOperation({ summary: 'Register an affiliate network/program (admin only)' })
  @ApiResponse({ status: 201, description: 'Program created — apiCredentials never returned, only hasCredentials' })
  create(@Body() dto: CreateAffiliateProgramDto) {
    return this.affiliateProgramsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all affiliate programs' })
  @ApiResponse({ status: 200, description: 'All programs' })
  findAll() {
    return this.affiliateProgramsService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an affiliate program, including rotating credentials or the hasCouponApi flag' })
  @ApiResponse({ status: 200, description: 'Program updated' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  update(@Param('id') id: string, @Body() dto: UpdateAffiliateProgramDto) {
    return this.affiliateProgramsService.update(id, dto);
  }
}
