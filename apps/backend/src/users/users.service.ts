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
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

// Deliberately excludes passwordHash/refreshTokenHash from anything returned to a client.
const SAFE_USER_SELECT = {
  id: true,
  name: true,
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

  /** Lets an existing ADMIN create another ADMIN-level teammate — separate from kiosk-scoped
   * user creation (kiosk-users module), since an admin has no kioskId at all. Mirrors that
   * module's generated-password pattern, but doesn't send a welcome email yet (no admin-facing
   * email template exists — the password is only ever shown once in the response). */
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
      await tx.notification.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
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
