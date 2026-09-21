import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ReviewerSession, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PublicApiService } from '../public-api/public-api.service';
import { CreateCouponTestEventDto } from '../public-api/dto/create-coupon-test-event.dto';
import { MintAttributionAttemptDto } from '../public-api/dto/mint-attribution-attempt.dto';
import {
  CreateReviewerDto,
  RedeemReviewerDto,
  ReviewerAccessDto,
} from './reviewer.dto';
import { ReviewerGuard } from './reviewer.guard';
import { ReviewersService } from './reviewers.service';

@ApiTags('Reviewers')
@ApiBearerAuth('jwt')
@Controller('reviewers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReviewersController {
  constructor(private readonly reviewers: ReviewersService) {}
  @Get() list() {
    return this.reviewers.list();
  }
  @Patch('access') access(@Body() dto: ReviewerAccessDto) {
    return this.reviewers.setEnabled(dto.enabled);
  }
  @Post() create(@Body() dto: CreateReviewerDto) {
    return this.reviewers.create(dto);
  }
  @Post(':id/revoke') revoke(@Param('id') id: string) {
    return this.reviewers.revoke(id);
  }
}
@ApiTags('Reviewer activation')
@Controller('reviewer-access')
export class ReviewerActivationController {
  constructor(private readonly reviewers: ReviewersService) {}
  @Post('redeem')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  redeem(@Body() dto: RedeemReviewerDto) {
    return this.reviewers.redeem(dto);
  }
}
@ApiTags('Reviewer extension')
@ApiBearerAuth('reviewer-token')
@Controller('reviewer-public')
@UseGuards(ReviewerGuard, ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ReviewerPublicController {
  constructor(
    private readonly reviewers: ReviewersService,
    private readonly publicApi: PublicApiService,
  ) {}
  @Get('devices/me/status') status() {
    return { kioskStatus: 'ACTIVE', deviceActive: true };
  }
  @Get('devices/me/savings') savings(
    @Req() req: { reviewer: ReviewerSession },
  ) {
    return this.reviewers.savings(req.reviewer.id);
  }
  @Get('promotions/active') promotions() {
    return this.publicApi.getUntargetedPromotions();
  }
  @Get('merchants/by-domain/:domain') merchant(
    @Param('domain') domain: string,
  ) {
    return this.publicApi.getMerchantByDomain(domain);
  }
  @Post('coupon-test-events') event(
    @Req() req: { reviewer: ReviewerSession },
    @Body() dto: CreateCouponTestEventDto,
  ) {
    return this.reviewers.recordEvent(req.reviewer.id, dto);
  }
  @Post('attribution-attempts') attribution(
    @Req() req: { reviewer: ReviewerSession },
    @Body() dto: MintAttributionAttemptDto,
  ) {
    return this.reviewers.attribution(req.reviewer.id, dto.merchantId);
  }
}
