import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Device } from '@prisma/client';
import { CurrentDevice } from '../common/decorators/current-device.decorator';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { DevicesService } from '../devices/devices.service';
import { ActiveAnnouncementDto } from './dto/active-announcement.dto';
import { ActivePromotionDto } from './dto/active-promotion.dto';
import { AttributionAttemptDto } from './dto/attribution-attempt.dto';
import { CreateCouponTestEventDto } from './dto/create-coupon-test-event.dto';
import { DeviceStatusDto } from './dto/device-status.dto';
import { LifetimeSavingsDto } from './dto/lifetime-savings.dto';
import { MintAttributionAttemptDto } from './dto/mint-attribution-attempt.dto';
import { PublicApiService } from './public-api.service';

@ApiTags('Public (device-facing)')
@ApiBearerAuth('device-token')
@Controller('public')
@UseGuards(DeviceAuthGuard)
export class PublicApiController {
  constructor(
    private readonly publicApiService: PublicApiService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get('devices/me/status')
  @ApiOperation({
    summary:
      'Confirm the calling device is active and its parent kiosk is ACTIVE. Poll on startup and periodically; a 401 here means fail-safe/go-dormant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Device and kiosk status',
    type: DeviceStatusDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid device token, device disabled, or kiosk inactive',
  })
  getDeviceStatus(@CurrentDevice() device: Device): Promise<DeviceStatusDto> {
    return this.publicApiService.getDeviceStatus(device.id);
  }

  @Delete('devices/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Deregister this device. Deletes its Device row and tokens entirely',
    description:
      "Self-service counterpart to the admin-only DELETE /devices/:id, authenticated by the device's " +
      'own token instead of a human JWT. Called by the desktop agent as its last authenticated act during ' +
      'uninstall, so a decommissioned kiosk machine does not linger in the dashboard as a stale device.',
  })
  @ApiResponse({ status: 204, description: 'Device and its tokens deleted' })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid device token, device disabled, or kiosk inactive',
  })
  deregisterDevice(@CurrentDevice() device: Device): Promise<void> {
    return this.devicesService.remove(device.id);
  }

  @Get('devices/me/savings')
  @ApiOperation({
    summary:
      "Lifetime savings total for this device. Sum of confirmed discounts across every 'applied' event",
  })
  @ApiResponse({
    status: 200,
    description: 'Lifetime savings total',
    type: LifetimeSavingsDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid device token, device disabled, or kiosk inactive',
  })
  getLifetimeSavings(
    @CurrentDevice() device: Device,
  ): Promise<LifetimeSavingsDto> {
    return this.publicApiService.getLifetimeSavings(device.id);
  }

  @Get('announcements/active')
  @ApiOperation({
    summary:
      "Active announcements for this device's location. StartAt<=now<=endAt, and scoped to all locations or this device's location specifically. Poll every 60s.",
  })
  @ApiResponse({
    status: 200,
    description: 'Active announcements, earliest-starting first',
    type: [ActiveAnnouncementDto],
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid device token, device disabled, or kiosk inactive',
  })
  getActiveAnnouncements(
    @CurrentDevice() device: Device,
  ): Promise<ActiveAnnouncementDto[]> {
    return this.publicApiService.getActiveAnnouncements(device.id);
  }

  @Get('promotions/active')
  @ApiOperation({
    summary:
      "Active promotions for this device. StartAt<=now<=endAt, active, and matching this device's location by tag or id. Rendered in the extension popup.",
  })
  @ApiResponse({
    status: 200,
    description: 'Active promotions, earliest-starting first',
    type: [ActivePromotionDto],
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid device token, device disabled, or kiosk inactive',
  })
  getActivePromotions(
    @CurrentDevice() device: Device,
  ): Promise<ActivePromotionDto[]> {
    return this.publicApiService.getActivePromotions(device.id);
  }

  @Get('merchants/by-domain/:domain')
  @ApiOperation({
    summary:
      'Look up an active merchant by domain. Merchant + active coupons + checkoutRecipe + attribution config',
  })
  @ApiResponse({
    status: 200,
    description:
      'Merchant with its active coupons, sorted most-likely-to-succeed first',
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing/invalid device token, device disabled, or kiosk inactive',
  })
  @ApiResponse({
    status: 404,
    description: 'No active merchant for this domain',
  })
  getMerchantByDomain(@Param('domain') domain: string) {
    return this.publicApiService.getMerchantByDomain(domain);
  }

  @Post('coupon-test-events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Report the result of a coupon-apply attempt (applied/failed/suppressed/no-coupons)',
  })
  @ApiResponse({ status: 201, description: 'Event recorded' })
  @ApiResponse({
    status: 400,
    description: 'merchantId or couponId does not exist',
  })
  recordCouponTestEvent(
    @CurrentDevice() device: Device,
    @Body() dto: CreateCouponTestEventDto,
  ) {
    return this.publicApiService.recordCouponTestEvent(device.id, dto);
  }

  @Post('attribution-attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Mint a sub-ID/click-ID for this device+merchant attribution attempt, for merchants whose network supports a pass-through tracking param (Merchant.affiliateSubIdParamKey). Logged so a later-reported commission conversion can be matched back to this device.',
  })
  @ApiResponse({
    status: 201,
    description: 'Minted sub-ID',
    type: AttributionAttemptDto,
  })
  @ApiResponse({ status: 400, description: 'merchantId does not exist' })
  mintAttributionAttempt(
    @CurrentDevice() device: Device,
    @Body() dto: MintAttributionAttemptDto,
  ): Promise<AttributionAttemptDto> {
    return this.publicApiService.mintAttributionAttempt(
      device.id,
      dto.merchantId,
    );
  }
}
