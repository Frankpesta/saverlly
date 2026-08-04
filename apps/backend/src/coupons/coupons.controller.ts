import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CouponsService } from './coupons.service';
import { CouponsQueryDto } from './dto/coupons-query.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@ApiTags('Coupons')
@ApiBearerAuth('jwt')
@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @ApiOperation({ summary: 'Manually add a coupon code for a merchant' })
  @ApiResponse({ status: 201, description: 'Coupon created with source: MANUAL' })
  @ApiResponse({ status: 409, description: 'This merchant already has a coupon with this code' })
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List coupons, optionally filtered by merchantId. Paginated via limit/cursor.' })
  @ApiResponse({ status: 200, description: 'Coupons' })
  findAll(@Query() query: CouponsQueryDto) {
    return this.couponsService.findAll(query.merchantId, query.limit, query.cursor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a coupon' })
  @ApiResponse({ status: 200, description: 'Coupon updated' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a coupon' })
  @ApiResponse({ status: 204, description: 'Coupon deleted' })
  remove(@Param('id') id: string) {
    return this.couponsService.remove(id);
  }
}
