import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KioskStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { hashToken } from '../common/crypto/token-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

const DEVICE_TOKEN_BYTES = 32;

// Device.lastSeenAt only gets written going forward (DeviceAuthGuard, on every authenticated
// device request) — it's null for every device that was active before that guard change shipped.
// Falling back to the most recent CouponTestEvent/AttributionAttempt per device means a device
// with real historical activity doesn't show "Never" just because it predates the heartbeat write.
const latestActivityInclude = {
  couponTestEvents: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { createdAt: true } },
  attributionAttempts: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { createdAt: true } },
};

function withDerivedLastSeenAt<
  T extends {
    lastSeenAt: Date | null;
    couponTestEvents: { createdAt: Date }[];
    attributionAttempts: { createdAt: Date }[];
  },
>(device: T) {
  const { couponTestEvents, attributionAttempts, ...rest } = device;
  const timestamps = [rest.lastSeenAt, couponTestEvents[0]?.createdAt, attributionAttempts[0]?.createdAt].filter(
    (d): d is Date => d != null,
  );
  return {
    ...rest,
    lastSeenAt: timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))) : null,
  };
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDeviceDto) {
    const setupCode = await this.prisma.locationSetupCode.findUnique({
      where: { code: dto.setupCode },
      include: { location: { include: { kiosk: true } } },
    });

    if (!setupCode || !setupCode.active) {
      throw new BadRequestException('Invalid or inactive setup code');
    }
    if (setupCode.location.kiosk.status !== KioskStatus.ACTIVE) {
      throw new BadRequestException('Parent kiosk is not active');
    }

    const device = await this.prisma.device.create({
      data: {
        locationId: setupCode.locationId,
        label: dto.label || dto.hostname || 'New Computer',
        localDeviceIdentifier: dto.deviceIdentifier,
        osVersion: dto.osVersion,
      },
    });

    const rawToken = randomBytes(DEVICE_TOKEN_BYTES).toString('base64url');
    await this.prisma.deviceToken.create({
      data: { deviceId: device.id, tokenHash: hashToken(rawToken) },
    });

    return { deviceId: device.id, label: device.label, token: rawToken };
  }

  async findAll(currentUser: JwtPayload) {
    if (currentUser.role === UserRole.ADMIN) {
      const devices = await this.prisma.device.findMany({
        orderBy: { createdAt: 'desc' },
        include: latestActivityInclude,
      });
      return devices.map(withDerivedLastSeenAt);
    }

    if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true },
      });
      const devices = await this.prisma.device.findMany({
        where: { locationId: { in: manager?.managedLocationIds ?? [] } },
        orderBy: { createdAt: 'desc' },
        include: latestActivityInclude,
      });
      return devices.map(withDerivedLastSeenAt);
    }

    // KIOSK_OWNER
    const devices = await this.prisma.device.findMany({
      where: { location: { kioskId: currentUser.kioskId! } },
      orderBy: { createdAt: 'desc' },
      include: latestActivityInclude,
    });
    return devices.map(withDerivedLastSeenAt);
  }

  async findOne(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto) {
    await this.findOne(id);
    return this.prisma.device.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.deviceToken.deleteMany({ where: { deviceId: id } });
    await this.prisma.device.delete({ where: { id } });
  }
}
