import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { KioskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../crypto/token-hash.util';

/**
 * Auth guard for machine clients (Chrome extension, desktop agent) using opaque
 * device tokens — entirely separate from human JWT auth. Re-checks kiosk status
 * and the device's kill-switch on every request, not just at token issuance, so
 * a deactivated kiosk/device is locked out immediately rather than on next login.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing device token');
    }

    const token = authHeader.slice('Bearer '.length);
    const deviceToken = await this.prisma.deviceToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { device: { include: { location: { include: { kiosk: true } } } } },
    });

    if (!deviceToken || deviceToken.revoked) {
      throw new UnauthorizedException('Invalid device token');
    }
    if (!deviceToken.device.active) {
      throw new UnauthorizedException('Device disabled');
    }
    if (deviceToken.device.location.kiosk.status !== KioskStatus.ACTIVE) {
      throw new UnauthorizedException('Kiosk inactive');
    }

    request.device = deviceToken.device;
    return true;
  }
}
