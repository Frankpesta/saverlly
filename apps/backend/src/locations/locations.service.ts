import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { generateSetupCode } from '../common/crypto/setup-code.util';
import { deleteLocationsCascade } from '../common/prisma/cascade-delete.util';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: JwtPayload, dto: CreateLocationDto) {
    const kioskId =
      currentUser.role === UserRole.ADMIN ? dto.kioskId : currentUser.kioskId;
    if (!kioskId) {
      throw new BadRequestException('kioskId is required');
    }
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id: kioskId },
      select: { id: true },
    });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }

    return this.prisma.location.create({
      data: {
        kioskId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        latitude: dto.latitude,
        longitude: dto.longitude,
        tags: dto.tags ?? [],
      },
    });
  }

  async findAll(currentUser: JwtPayload) {
    if (currentUser.role === UserRole.ADMIN) {
      return this.prisma.location.findMany({ orderBy: { createdAt: 'desc' } });
    }

    if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true },
      });
      return this.prisma.location.findMany({
        where: { id: { in: manager?.managedLocationIds ?? [] } },
        orderBy: { createdAt: 'desc' },
      });
    }

    // KIOSK_OWNER
    return this.prisma.location.findMany({
      where: { kioskId: currentUser.kioskId! },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  async update(id: string, dto: UpdateLocationDto) {
    await this.findOne(id);
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  /** Deleting a location cascades to everything under it — setup codes, devices, and each
   * device's own history (tokens, coupon test events, attribution attempts, commission events) —
   * none of which cascade at the schema level, so this has to be done explicitly. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.$transaction((tx) => deleteLocationsCascade(tx, [id]));
  }

  async createSetupCode(locationId: string) {
    await this.findOne(locationId);

    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.locationSetupCode.create({
          data: { locationId, code: generateSetupCode() },
        });
      } catch (err) {
        const isUniqueConflict =
          err &&
          typeof err === 'object' &&
          'code' in err &&
          err.code === 'P2002';
        if (!isUniqueConflict || attempt === MAX_ATTEMPTS - 1) {
          throw err;
        }
      }
    }
    throw new Error('Failed to generate a unique setup code');
  }

  async findSetupCodes(locationId: string) {
    await this.findOne(locationId);
    return this.prisma.locationSetupCode.findMany({
      where: { locationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSetupCode(locationId: string, codeId: string, active: boolean) {
    const code = await this.prisma.locationSetupCode.findFirst({
      where: { id: codeId, locationId },
    });
    if (!code) {
      throw new NotFoundException('Setup code not found for this location');
    }
    return this.prisma.locationSetupCode.update({
      where: { id: codeId },
      data: { active },
    });
  }
}
