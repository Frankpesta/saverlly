import { Module } from '@nestjs/common';
import { PublicApiModule } from '../public-api/public-api.module';
import { ReviewersService } from './reviewers.service';
import { ReviewerGuard } from './reviewer.guard';
import {
  ReviewersController,
  ReviewerActivationController,
  ReviewerPublicController,
} from './reviewers.controller';
@Module({
  imports: [PublicApiModule],
  providers: [ReviewersService, ReviewerGuard],
  controllers: [
    ReviewersController,
    ReviewerActivationController,
    ReviewerPublicController,
  ],
})
export class ReviewersModule {}
