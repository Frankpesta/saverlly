import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PASSWORD_BCRYPT_ROUNDS } from '../common/crypto/password-hash.constants';
import { generatePassword } from '../common/crypto/password-generator.util';
import { deleteUserOwnedRows } from '../common/prisma/cascade-delete.util';
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
        name: dto.name,
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

    // A kiosk-owner may only ever touch location-manager accounts. Never a peer owner.
    this.assertRoleAssignable(actingRole, target.role);
    if (dto.role) {
      this.assertRoleAssignable(actingRole, dto.role);
    }

    // Email is the sign-in identifier and is unique platform-wide, so a collision has to come
    // back as a 409 the form can point at the field. Left to Prisma it surfaces as an
    // unmapped P2002 and a 500.
    if (dto.email && dto.email !== target.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That email is already in use');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        disabled: dto.disabled,
        managedLocationIds: dto.managedLocationIds,
      },
      select: KIOSK_USER_SAFE_SELECT,
    });
  }

  /**
   * Issue a fresh first-time password for a kiosk user and re-send their welcome email.
   *
   * The password generated at create time is shown once and emailed once. When that email
   * doesn't arrive (which the client reported), there was previously no way back: the owner
   * could not see the old password and could not mint a new one. This returns the new password
   * so the owner can read it out directly, and re-sends the email as well.
   */
  async resendPassword(kioskId: string, userId: string, actingRole: UserRole) {
    const kiosk = await this.assertKioskExists(kioskId);
    const target = await this.prisma.user.findFirst({
      where: { id: userId, kioskId },
    });
    if (!target) {
      throw new NotFoundException('User not found in this kiosk');
    }
    this.assertRoleAssignable(actingRole, target.role);

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(
      generatedPassword,
      PASSWORD_BCRYPT_ROUNDS,
    );

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
      select: KIOSK_USER_SAFE_SELECT,
    });

    // Same reasoning as create(): the password is already rotated and committed, so a delivery
    // failure must not fail the request. The caller still gets the password in the response.
    try {
      if (target.role === UserRole.KIOSK_OWNER) {
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
        `Password for user ${user.id} was reset, but the notification failed`,
        error instanceof Error ? error.stack : error,
      );
    }

    return { user, generatedPassword };
  }

  async remove(kioskId: string, userId: string, actingRole: UserRole) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, kioskId },
    });
    if (!target) {
      throw new NotFoundException('User not found in this kiosk');
    }
    this.assertRoleAssignable(actingRole, target.role);

    await this.prisma.$transaction(async (tx) => {
      await deleteUserOwnedRows(tx, [userId]);
      await tx.user.delete({ where: { id: userId } });
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
