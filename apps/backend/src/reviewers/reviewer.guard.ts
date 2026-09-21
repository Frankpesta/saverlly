import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ReviewersService } from './reviewers.service';
@Injectable()
export class ReviewerGuard implements CanActivate {
  constructor(private readonly reviewers: ReviewersService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const auth = request.headers.authorization;
    request.reviewer = await this.reviewers.authenticate(
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice(7)
        : '',
    );
    return true;
  }
}
