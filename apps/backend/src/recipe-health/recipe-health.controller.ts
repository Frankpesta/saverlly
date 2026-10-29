import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Device } from '@prisma/client';
import { CurrentDevice } from '../common/decorators/current-device.decorator';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { DeviceThrottlerGuard } from '../common/guards/device-throttler.guard';
import { RecipeHealthReportDto } from './recipe-health.dto';
import { RecipeHealthService } from './recipe-health.service';

@ApiTags('Public (device-facing)')
@ApiBearerAuth('device-token')
@Controller('public')
@UseGuards(DeviceAuthGuard, DeviceThrottlerGuard)
// The extension sends at most about one report per store and outcome a day.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class RecipeHealthController {
  constructor(private readonly recipeHealth: RecipeHealthService) {}

  @Post('recipe-health')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Report whether a store's checkout recipe still finds its checkout",
  })
  @ApiResponse({ status: 204, description: 'Report recorded' })
  @ApiResponse({
    status: 400,
    description: 'merchantId does not exist, or problem missing',
  })
  async report(
    @CurrentDevice() device: Device,
    @Body() dto: RecipeHealthReportDto,
  ): Promise<void> {
    await this.recipeHealth.record(device.id, dto);
  }
}
