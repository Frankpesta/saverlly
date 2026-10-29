import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ApplyStoreSetupDto,
  RedeemStoreSetupCodeDto,
  SubmitStoreSetupRecipeDto,
} from './dto/store-setup.dto';
import {
  CurrentStoreSetupSession,
  SetupSessionGuard,
  SetupSessionIpThrottlerGuard,
  SetupSessionThrottlerGuard,
} from './setup-session.guard';
import {
  StoreSetupService,
  type AuthenticatedStoreSetupSession,
} from './store-setup.service';

@ApiTags('Store setup')
@ApiBearerAuth('jwt')
@Controller('merchants/:merchantId/setup-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class StoreSetupAdminController {
  constructor(private readonly storeSetup: StoreSetupService) {}

  @Post()
  @ApiOperation({
    summary:
      'Issue a one-time code for setting this store up from the extension',
    description:
      'The plaintext code is returned only here. Any other live code or session for the store is cancelled.',
  })
  @ApiResponse({ status: 201, description: 'Code issued' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  issue(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeSetup.issueCode(merchantId, user.sub);
  }

  @Get('current')
  @ApiOperation({ summary: "The store's most recent setup session, if any" })
  @ApiResponse({ status: 200, description: '{ session } (null when none)' })
  current(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.storeSetup.getCurrent(merchantId);
  }

  @Post(':sessionId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Save the submitted draft as the store's checkout recipe",
  })
  @ApiResponse({ status: 200, description: 'Recipe saved to the store' })
  @ApiResponse({ status: 400, description: 'Draft fails recipe validation' })
  @ApiResponse({
    status: 409,
    description: 'Nothing submitted, already saved, or draft changed',
  })
  apply(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: ApplyStoreSetupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storeSetup.apply(
      merchantId,
      sessionId,
      user.sub,
      dto.submittedAt,
    );
  }

  @Post(':sessionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discard a code, connected session or draft' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  @ApiResponse({ status: 409, description: 'Already saved to the store' })
  cancel(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.storeSetup.cancel(merchantId, sessionId);
  }
}

@ApiTags('Store setup (extension)')
@Controller('store-setup')
export class StoreSetupActivationController {
  constructor(private readonly storeSetup: StoreSetupService) {}

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Exchange a one-time setup code for a store-scoped setup session',
  })
  @ApiResponse({ status: 200, description: 'Session started' })
  @ApiResponse({ status: 401, description: 'Code invalid, used or expired' })
  @ApiResponse({ status: 429, description: 'Too many attempts' })
  redeem(@Body() dto: RedeemStoreSetupCodeDto) {
    return this.storeSetup.redeem(dto);
  }
}

@ApiTags('Store setup (extension)')
@ApiBearerAuth('store-setup-token')
@Controller('store-setup/session')
@UseGuards(
  SetupSessionIpThrottlerGuard,
  SetupSessionGuard,
  SetupSessionThrottlerGuard,
)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class StoreSetupSessionController {
  constructor(private readonly storeSetup: StoreSetupService) {}

  @Get()
  @ApiOperation({
    summary: 'The store this session may set up, and its live recipe',
  })
  @ApiResponse({ status: 200, description: 'Session details' })
  @ApiResponse({ status: 401, description: 'Session ended' })
  get(@CurrentStoreSetupSession() session: AuthenticatedStoreSetupSession) {
    return this.storeSetup.toExtensionSession(session);
  }

  @Post('recipe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit a draft recipe and its test result for the admin to review',
    description:
      "Never changes the store's live recipe; only the dashboard Save does.",
  })
  @ApiResponse({ status: 200, description: 'Draft stored' })
  @ApiResponse({ status: 400, description: 'Recipe or test result invalid' })
  @ApiResponse({ status: 401, description: 'Session ended' })
  submit(
    @CurrentStoreSetupSession() session: AuthenticatedStoreSetupSession,
    @Body() dto: SubmitStoreSetupRecipeDto,
  ) {
    return this.storeSetup.submitRecipe(session, dto);
  }

  @Post('end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End this setup session from the extension' })
  @ApiResponse({ status: 204, description: 'Session ended' })
  async end(
    @CurrentStoreSetupSession() session: AuthenticatedStoreSetupSession,
  ) {
    await this.storeSetup.endSession(session);
  }
}
