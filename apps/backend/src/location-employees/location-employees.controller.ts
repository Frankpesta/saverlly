import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantResource, TenantResourceType } from '../common/decorators/tenant-resource.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { CreateLocationEmployeeDto } from './dto/create-location-employee.dto';
import { UpdateLocationEmployeeDto } from './dto/update-location-employee.dto';
import { LocationEmployeesService } from './location-employees.service';

// Nested under /locations/:locationId rather than its own top-level resource: an employee is
// never looked up or listed except in the context of the location it's at, so there's no reason
// to give it a bare /location-employees/:id surface the way Kiosks/Merchants/etc. have one.
@ApiTags('Location Employees')
@ApiBearerAuth('jwt')
@Controller('locations/:locationId/employees')
@UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
@Roles(UserRole.ADMIN, UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
@TenantResource(TenantResourceType.LOCATION, 'locationId')
export class LocationEmployeesController {
  constructor(private readonly locationEmployeesService: LocationEmployeesService) {}

  @Post()
  @ApiOperation({ summary: 'Add an on-site employee to this location (a contact roster, not a portal login)' })
  @ApiResponse({ status: 201, description: 'Employee added' })
  create(@Param('locationId') locationId: string, @Body() dto: CreateLocationEmployeeDto) {
    return this.locationEmployeesService.create(locationId, dto);
  }

  @Get()
  @ApiOperation({ summary: "This location's employee roster" })
  @ApiResponse({ status: 200, description: 'Employees at this location' })
  findAll(@Param('locationId') locationId: string) {
    return this.locationEmployeesService.findAll(locationId);
  }

  @Patch(':employeeId')
  @ApiOperation({ summary: 'Update an employee' })
  @ApiResponse({ status: 200, description: 'Employee updated' })
  @ApiResponse({ status: 404, description: 'Employee not found at this location' })
  update(
    @Param('locationId') locationId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateLocationEmployeeDto,
  ) {
    return this.locationEmployeesService.update(locationId, employeeId, dto);
  }

  @Delete(':employeeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an employee from the roster' })
  @ApiResponse({ status: 204, description: 'Employee removed' })
  @ApiResponse({ status: 404, description: 'Employee not found at this location' })
  remove(@Param('locationId') locationId: string, @Param('employeeId') employeeId: string) {
    return this.locationEmployeesService.remove(locationId, employeeId);
  }
}
