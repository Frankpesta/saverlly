import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { MerchantsService } from './merchants.service';

@ApiTags('Merchants')
@ApiBearerAuth('jwt')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post()
  @ApiOperation({
    summary: 'Add a store',
    description:
      'Tracking method is required. Even for a merchant with no coupon API at all, since that is ' +
      'what makes commission attribution work. Coupon sourcing (affiliateProgramId) is optional.',
  })
  @ApiResponse({ status: 201, description: 'Merchant created' })
  @ApiResponse({ status: 400, description: 'Tracking fields missing for the chosen attributionMethod' })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all merchants' })
  @ApiResponse({ status: 200, description: 'All merchants' })
  findAll() {
    return this.merchantsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a merchant by id' })
  @ApiResponse({ status: 200, description: 'The merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  findOne(@Param('id') id: string) {
    return this.merchantsService.findOneOrThrow(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a merchant, including checkoutRecipe, attributionMethod, and tracking fields' })
  @ApiResponse({ status: 200, description: 'Merchant updated' })
  @ApiResponse({ status: 400, description: 'Tracking fields missing for the resulting attributionMethod' })
  update(@Param('id') id: string, @Body() dto: UpdateMerchantDto) {
    return this.merchantsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a merchant' })
  @ApiResponse({ status: 204, description: 'Merchant deleted' })
  remove(@Param('id') id: string) {
    return this.merchantsService.remove(id);
  }
}
