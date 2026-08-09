import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KioskStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { hashToken } from '../common/crypto/token-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

const DEVICE_TOKEN_BYTES = 32;

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
      return this.prisma.device.findMany({ orderBy: { createdAt: 'desc' } });
    }

    if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true },
      });
      return this.prisma.device.findMany({
        where: { locationId: { in: manager?.managedLocationIds ?? [] } },
        orderBy: { createdAt: 'desc' },
      });
    }

    // KIOSK_OWNER
    return this.prisma.device.findMany({
      where: { location: { kioskId: currentUser.kioskId! } },
      orderBy: { createdAt: 'desc' },
    });
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
