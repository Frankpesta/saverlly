import * as fs from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PASSWORD_BCRYPT_ROUNDS } from '../common/crypto/password-hash.constants';
import { generatePassword } from '../common/crypto/password-generator.util';
import { deleteUserOwnedRows } from '../common/prisma/cascade-delete.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

// Deliberately excludes passwordHash/refreshTokenHash from anything returned to a client.
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  email: true,
  role: true,
  kioskId: true,
  managedLocationIds: true,
  disabled: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  /**
   * Point a user's avatarUrl at a newly uploaded file, or clear it.
   *
   * The previous file is unlinked so replacing a photo repeatedly doesn't leave the uploads
   * directory growing without bound. Only files this server wrote under /uploads/avatars are
   * touched: an avatarUrl pointing anywhere else is left alone.
   */
  async setAvatar(userId: string, avatarUrl: string | null) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    if (existing.avatarUrl && existing.avatarUrl !== avatarUrl) {
      this.discardAvatarFile(existing.avatarUrl);
    }
    return user;
  }

  private discardAvatarFile(url: string) {
    const marker = '/uploads/avatars/';
    const index = url.indexOf(marker);
    if (index === -1) return;
    // basename() so a crafted "…/uploads/avatars/../../.env" can't escape the directory.
    const filename = path.basename(url.slice(index + marker.length));
    if (!filename || filename === '.' || filename === '..') return;
    fs.rm(
      path.join(process.cwd(), 'uploads', 'avatars', filename),
      { force: true },
      () => undefined,
    );
  }

  async updateMe(userId: string, data: { name?: string; email?: string }) {
    try {
      return await this.prisma.user.update({ where: { id: userId }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That email is already in use');
      }
      throw err;
    }
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  setRefreshTokenHash(userId: string, refreshTokenHash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  /** Lets an existing ADMIN create another ADMIN-level teammate. Separate from kiosk-scoped
   * user creation (kiosk-users module), since an admin has no kioskId at all. Mirrors that
   * module's generated-password pattern, but doesn't send a welcome email yet (no admin-facing
   * email template exists. The password is only ever shown once in the response). */
  async createAdmin(dto: CreateAdminUserDto) {
    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, PASSWORD_BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: UserRole.ADMIN,
          mustChangePassword: true,
        },
        select: SAFE_USER_SELECT,
      });
      return { user, generatedPassword };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That email is already in use');
      }
      throw err;
    }
  }

  findAdmins() {
    return this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAdmin(userId: string, actingUserId: string, dto: UpdateAdminUserDto) {
    if (userId === actingUserId && dto.disabled === true) {
      throw new BadRequestException('You cannot disable your own admin account');
    }
    await this.assertAdminExists(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, disabled: dto.disabled },
      select: SAFE_USER_SELECT,
    });
  }

  async removeAdmin(userId: string, actingUserId: string) {
    if (userId === actingUserId) {
      throw new BadRequestException('You cannot delete your own admin account');
    }
    await this.assertAdminExists(userId);
    await this.prisma.$transaction(async (tx) => {
      await deleteUserOwnedRows(tx, [userId]);
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /** "Needs attention" on the admin Overview has no backing table of its own. Its items are
   * derived client-side from other resources (inactive kiosks, disabled devices, ...), so
   * dismissing one just records the item's stable key against the user rather than mutating
   * anything about the underlying kiosk/device/payout. */
  async findDismissedAlertKeys(userId: string): Promise<string[]> {
    const rows = await this.prisma.dismissedAlert.findMany({
      where: { userId },
      select: { alertKey: true },
    });
    return rows.map((row) => row.alertKey);
  }

  async dismissAlert(userId: string, alertKey: string): Promise<void> {
    await this.prisma.dismissedAlert.upsert({
      where: { userId_alertKey: { userId, alertKey } },
      create: { userId, alertKey },
      update: {},
    });
  }

  async undismissAlert(userId: string, alertKey: string): Promise<void> {
    await this.prisma.dismissedAlert.deleteMany({ where: { userId, alertKey } });
  }

  private async assertAdminExists(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.ADMIN },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }
  }
}
