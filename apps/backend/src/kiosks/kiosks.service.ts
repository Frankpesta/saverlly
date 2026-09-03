import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KioskStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PASSWORD_BCRYPT_ROUNDS } from '../common/crypto/password-hash.constants';
import { generatePassword } from '../common/crypto/password-generator.util';
import { deleteKioskCascade } from '../common/prisma/cascade-delete.util';
import { KIOSK_USER_SAFE_SELECT } from '../kiosk-users/kiosk-user-safe-select.const';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { UpdateKioskDto } from './dto/update-kiosk.dto';

@Injectable()
export class KiosksService {
  private readonly logger = new Logger(KiosksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  async create(dto: CreateKioskDto) {
    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(
      generatedPassword,
      PASSWORD_BCRYPT_ROUNDS,
    );

    const { kiosk, owner } = await this.prisma.$transaction(async (tx) => {
      const kiosk = await tx.kiosk.create({
        data: {
          name: dto.name,
          revenueSharePct: dto.revenueSharePct,
          status: KioskStatus.ACTIVE,
        },
      });
      const owner = await tx.user.create({
        data: {
          name: dto.owner.name,
          email: dto.owner.email,
          passwordHash,
          role: UserRole.KIOSK_OWNER,
          kioskId: kiosk.id,
          managedLocationIds: [],
          mustChangePassword: true,
        },
        select: KIOSK_USER_SAFE_SELECT,
      });
      return { kiosk, owner };
    });

    // Deliberately outside the transaction. Enqueuing a BullMQ job (or writing the
    // Notification row) before the transaction commits risks a worker picking up the job
    // before Postgres has actually made the kiosk/owner visible. Caught rather than awaited
    // straight through: the kiosk and owner are already committed at this point, so a
    // notification-delivery hiccup must not turn a successful creation into a 500.
    try {
      await this.notificationTriggers.kioskOwnerCreated(
        owner,
        generatedPassword,
        kiosk.name,
      );
    } catch (error) {
      this.logger.error(
        `Kiosk ${kiosk.id} and owner ${owner.id} were created, but the owner-created notification failed`,
        error instanceof Error ? error.stack : error,
      );
    }

    return { kiosk, owner, generatedPassword };
  }

  findAll() {
    return this.prisma.kiosk.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }
    return kiosk;
  }

  /** The kiosk owner's own email doubles as the kiosk's contact address. There's no separate
   * stored contact field. Lets a location manager reach their kiosk owner without exposing
   * revenue share, status, or other owner-only kiosk fields. */
  async findOwnerContact(kioskId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { kioskId, role: UserRole.KIOSK_OWNER },
      select: { name: true, email: true },
    });
    return { name: owner?.name ?? null, email: owner?.email ?? null };
  }

  async update(id: string, dto: UpdateKioskDto) {
    await this.findOne(id);
    return this.prisma.kiosk.update({ where: { id }, data: dto });
  }

  async updateStatus(id: string, status: KioskStatus) {
    await this.findOne(id);
    return this.prisma.kiosk.update({ where: { id }, data: { status } });
  }

  /** Deletes the kiosk and everything under it. Users, locations, devices, device history,
   * kiosk-scoped announcements, payouts. See `deleteKioskCascade` for the full breakdown. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.$transaction((tx) => deleteKioskCascade(tx, id), {
      timeout: 20_000,
    });
  }
}
