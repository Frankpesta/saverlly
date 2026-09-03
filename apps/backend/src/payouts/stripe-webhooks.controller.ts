import { BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripeService } from '../stripe/stripe.service';
import { PayoutsService } from './payouts.service';

// Excluded from Swagger. This is a machine-to-machine webhook authenticated by Stripe's
// own signature scheme (see StripeService.constructWebhookEvent), not JWT/device auth.
@ApiExcludeController()
@Controller('webhooks')
export class StripeWebhooksController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly payoutsService: PayoutsService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or request body');
    }

    let event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    await this.payoutsService.handleStripeWebhookEvent(event);

    return { received: true };
  }
}
