import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PASSWORD_BCRYPT_ROUNDS } from '../common/crypto/password-hash.constants';
import { generatePassword } from '../common/crypto/password-generator.util';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKioskUserDto } from './dto/create-kiosk-user.dto';
import { UpdateKioskUserDto } from './dto/update-kiosk-user.dto';
import { KIOSK_USER_SAFE_SELECT } from './kiosk-user-safe-select.const';

@Injectable()
export class KioskUsersService {
  private readonly logger = new Logger(KioskUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  async create(kioskId: string, actingRole: UserRole, dto: CreateKioskUserDto) {
    const kiosk = await this.assertKioskExists(kioskId);
    this.assertRoleAssignable(actingRole, dto.role);

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(
      generatedPassword,
      PASSWORD_BCRYPT_ROUNDS,
    );

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        kioskId,
        managedLocationIds: dto.managedLocationIds ?? [],
        mustChangePassword: true,
      },
      select: KIOSK_USER_SAFE_SELECT,
    });

    // The user row is already committed at this point (single Prisma create above), so a
    // notification-delivery hiccup here must not turn a successful creation into a 500.
    try {
      if (dto.role === UserRole.KIOSK_OWNER) {
        await this.notificationTriggers.kioskOwnerCreated(
          user,
          generatedPassword,
          kiosk.name,
        );
      } else {
        await this.notificationTriggers.locationManagerCreated(
          user,
          generatedPassword,
          kiosk.name,
        );
      }
    } catch (error) {
      this.logger.error(
        `User ${user.id} was created, but the welcome notification failed`,
        error instanceof Error ? error.stack : error,
      );
    }

    return { user, generatedPassword };
  }

  async findAllForKiosk(kioskId: string) {
    await this.assertKioskExists(kioskId);
    return this.prisma.user.findMany({
      where: { kioskId },
      select: KIOSK_USER_SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    kioskId: string,
    userId: string,
    actingRole: UserRole,
    dto: UpdateKioskUserDto,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, kioskId },
    });
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
      select: KIOSK_USER_SAFE_SELECT,
    });
  }

  private assertRoleAssignable(actingRole: UserRole, targetRole: UserRole) {
    if (
      actingRole === UserRole.KIOSK_OWNER &&
      targetRole !== UserRole.LOCATION_MANAGER
    ) {
      throw new ForbiddenException(
        'Kiosk owners may only manage location-manager accounts',
      );
    }
  }

  private async assertKioskExists(kioskId: string) {
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id: kioskId },
      select: { id: true, name: true },
    });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }
    return kiosk;
  }
}
