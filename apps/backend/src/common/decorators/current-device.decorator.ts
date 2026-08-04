import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Device } from '@prisma/client';

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Device => {
    const request = ctx.switchToHttp().getRequest();
    return request.device;
  },
);
