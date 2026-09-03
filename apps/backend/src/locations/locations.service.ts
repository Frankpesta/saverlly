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

  // Included on every list/detail read so the locations table can show and generate a setup
  // code inline. Fetching it per row instead would be one request per location, and the code
  // being buried on the detail page is exactly what the client asked to fix.
  private static readonly WITH_SETUP_CODE = {
    locationSetupCode: { select: { id: true, code: true, active: true, createdAt: true } },
  } as const;

  async findAll(currentUser: JwtPayload) {
    if (currentUser.role === UserRole.ADMIN) {
      return this.prisma.location.findMany({
        orderBy: { createdAt: 'desc' },
        include: LocationsService.WITH_SETUP_CODE,
      });
    }

    if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true },
      });
      return this.prisma.location.findMany({
        where: { id: { in: manager?.managedLocationIds ?? [] } },
        orderBy: { createdAt: 'desc' },
        include: LocationsService.WITH_SETUP_CODE,
      });
    }

    // KIOSK_OWNER
    return this.prisma.location.findMany({
      where: { kioskId: currentUser.kioskId! },
      orderBy: { createdAt: 'desc' },
      include: LocationsService.WITH_SETUP_CODE,
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

  /** Deleting a location cascades to everything under it. Setup codes, devices, and each
   * device's own history (tokens, coupon test events, attribution attempts, commission events)
   * none of which cascade at the schema level, so this has to be done explicitly. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.$transaction((tx) => deleteLocationsCascade(tx, [id]));
  }

  /** A location only ever has one setup code. The first call creates it; every call after that
   * regenerates the existing row in place (new code string, reactivated) rather than adding a
   * second row, `locationId` is `@unique` on `LocationSetupCode`, so this is the only shape
   * that's actually possible now. */
  async createSetupCode(locationId: string) {
    await this.findOne(locationId);

    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.locationSetupCode.upsert({
          where: { locationId },
          create: { locationId, code: generateSetupCode() },
          update: { code: generateSetupCode(), active: true },
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

  async findSetupCode(locationId: string) {
    await this.findOne(locationId);
    return this.prisma.locationSetupCode.findUnique({ where: { locationId } });
  }

  async updateSetupCode(locationId: string, active: boolean) {
    const code = await this.prisma.locationSetupCode.findUnique({
      where: { locationId },
    });
    if (!code) {
      throw new NotFoundException('Setup code not found for this location');
    }
    return this.prisma.locationSetupCode.update({
      where: { locationId },
      data: { active },
    });
  }
}
