import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { PASSWORD_BCRYPT_ROUNDS } from '../common/crypto/password-hash.constants';
import { hashToken, tokenMatchesHash } from '../common/crypto/token-hash.util';
import { EmailService } from '../email/email.service';
import { PasswordResetEmail } from '../email/templates/password-reset';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  JwtPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';

const RESET_TOKEN_TTL = '30m';
const RESET_TOKEN_TTL_MINUTES = 30;

interface ResetTokenPayload {
  sub: string;
  purpose: 'password-reset';
  /** Fingerprint of the passwordHash at the moment this token was issued — redemption
   * re-checks it matches the user's *current* passwordHash, giving single-use semantics
   * with no extra storage: the first successful reset changes the hash, invalidating any
   * other still-unexpired token for the same user. */
  fp: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.disabled) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(
      user.id,
      user.role,
      user.kioskId,
      user.mustChangePassword,
    );
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.disabled || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!tokenMatchesHash(refreshToken, user.refreshTokenHash)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(
      user.id,
      user.role,
      user.kioskId,
      user.mustChangePassword,
    );
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<TokenPair> {
    const user = await this.usersService.findById(userId);
    if (!user || user.disabled) {
      throw new UnauthorizedException();
    }

    const currentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      PASSWORD_BCRYPT_ROUNDS,
    );
    const updated = await this.usersService.updatePassword(
      userId,
      passwordHash,
    );

    // Issue a fresh token pair immediately, same shape as login — the caller's current
    // access token still carries mustChangePassword: true and would otherwise keep
    // redirecting them for up to its remaining TTL until the next natural refresh.
    return this.issueTokens(updated.id, updated.role, updated.kioskId, false);
  }

  /** Always resolves the same way regardless of whether the email matches an account — the
   * caller (controller) returns one generic response either way, so this never reveals
   * whether an email is registered. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.disabled) return;

    const fingerprint = this.passwordFingerprint(user.passwordHash);
    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        purpose: 'password-reset',
        fp: fingerprint,
      } satisfies ResetTokenPayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: RESET_TOKEN_TTL,
      },
    );

    const namespace = user.role === UserRole.ADMIN ? 'admin' : 'portal';
    const dashboardUrl = this.configService.get<string>(
      'DASHBOARD_BASE_URL',
      'http://localhost:3001',
    );
    const backendUrl = this.configService.get<string>(
      'PUBLIC_BACKEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${dashboardUrl}/${namespace}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await this.emailService.send(
        user.email,
        'Reset your Saverlly password',
        PasswordResetEmail({
          resetUrl,
          logoUrl: `${backendUrl}/brand/logo-light-bg-sm.png`,
          expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        }),
      );
    } catch (error) {
      // A delivery hiccup must not change the (always-generic) response the caller sees.
      this.logger.error(
        `Failed to send password-reset email to user ${user.id}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    let payload: ResetTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<ResetTokenPayload>(
        dto.token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired reset link');
    }
    if (payload.purpose !== 'password-reset') {
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.disabled) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }
    if (this.passwordFingerprint(user.passwordHash) !== payload.fp) {
      // Password already changed since this token was issued — either already used, or a
      // change-password/another reset happened in the meantime. Either way, not valid anymore.
      throw new UnauthorizedException('This reset link has already been used');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      PASSWORD_BCRYPT_ROUNDS,
    );
    await this.usersService.updatePassword(user.id, passwordHash);
    // Also revoke any existing session — a reset should sign out anywhere already logged in.
    await this.usersService.setRefreshTokenHash(user.id, null);
  }

  private passwordFingerprint(passwordHash: string): string {
    return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
  }

  private async issueTokens(
    userId: string,
    role: JwtPayload['role'],
    kioskId: string | null,
    mustChangePassword: boolean,
  ): Promise<TokenPair> {
    const accessPayload: JwtPayload = {
      sub: userId,
      role,
      kioskId,
      mustChangePassword,
    };
    const accessToken = await this.jwtService.signAsync(
      { ...accessPayload },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Kept long relative to a typical session — proxy.ts's silent-refresh-on-expiry
        // path covers a still-expired case anyway, but a short TTL here just means every
        // dashboard tab open for a while pays a refresh round-trip on its next navigation
        // for no real security benefit (the refresh token is the actual revocation point).
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
          '7d',
        ) as StringValue,
      },
    );

    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti: randomUUID(),
    };
    const refreshToken = await this.jwtService.signAsync(
      { ...refreshPayload },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '30d',
        ) as StringValue,
      },
    );

    await this.usersService.setRefreshTokenHash(
      userId,
      hashToken(refreshToken),
    );

    return { accessToken, refreshToken };
  }
}
