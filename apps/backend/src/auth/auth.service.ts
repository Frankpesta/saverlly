import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { hashToken, tokenMatchesHash } from '../common/crypto/token-hash.util';
import { UsersService } from '../users/users.service';
import { JwtPayload, RefreshTokenPayload } from './interfaces/jwt-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    return this.issueTokens(user.id, user.role, user.kioskId);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
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

    return this.issueTokens(user.id, user.role, user.kioskId);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  private async issueTokens(
    userId: string,
    role: JwtPayload['role'],
    kioskId: string | null,
  ): Promise<TokenPair> {
    const accessPayload: JwtPayload = { sub: userId, role, kioskId };
    const accessToken = await this.jwtService.signAsync({ ...accessPayload }, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as StringValue,
    });

    const refreshPayload: RefreshTokenPayload = { sub: userId, jti: randomUUID() };
    const refreshToken = await this.jwtService.signAsync({ ...refreshPayload }, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') as StringValue,
    });

    await this.usersService.setRefreshTokenHash(userId, hashToken(refreshToken));

    return { accessToken, refreshToken };
  }
}
