import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKioskUserDto } from './dto/create-kiosk-user.dto';
import { UpdateKioskUserDto } from './dto/update-kiosk-user.dto';

const PASSWORD_BCRYPT_ROUNDS = 12;

@Injectable()
export class KioskUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(kioskId: string, actingRole: UserRole, dto: CreateKioskUserDto) {
    await this.assertKioskExists(kioskId);
    this.assertRoleAssignable(actingRole, dto.role);

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        kioskId,
        managedLocationIds: dto.managedLocationIds ?? [],
      },
      select: this.safeSelect(),
    });
  }

  async findAllForKiosk(kioskId: string) {
    await this.assertKioskExists(kioskId);
    return this.prisma.user.findMany({
      where: { kioskId },
      select: this.safeSelect(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    kioskId: string,
    userId: string,
    actingRole: UserRole,
    dto: UpdateKioskUserDto,
  ) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, kioskId } });
    if (!target) {
      throw new NotFoundException('User not found in this kiosk');
    }

    // A kiosk-owner may only ever touch location-manager accounts — never a peer owner.
    this.assertRoleAssignable(actingRole, target.role);
    if (dto.role) {
      this.assertRoleAssignable(actingRole, dto.role);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        role: dto.role,
        disabled: dto.disabled,
        managedLocationIds: dto.managedLocationIds,
      },
      select: this.safeSelect(),
    });
  }

  private assertRoleAssignable(actingRole: UserRole, targetRole: UserRole) {
    if (actingRole === UserRole.KIOSK_OWNER && targetRole !== UserRole.LOCATION_MANAGER) {
      throw new ForbiddenException('Kiosk owners may only manage location-manager accounts');
    }
  }

  private async assertKioskExists(kioskId: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id: kioskId }, select: { id: true } });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }
  }

  private safeSelect() {
    return {
      id: true,
      email: true,
      role: true,
      kioskId: true,
      managedLocationIds: true,
      disabled: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
