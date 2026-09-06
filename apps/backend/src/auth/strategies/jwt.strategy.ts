import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Re-checked against the DB on every request rather than trusting the signed payload alone
  // otherwise a deleted or disabled user's still-unexpired access token (up to 7 days) keeps
  // working right up until it naturally expires. This is what makes "delete this kiosk" /
  // "disable this user" actually revoke access immediately instead of just eventually.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Password-reset tokens are signed with this same secret (see AuthService.forgotPassword)
    // but carry a completely different payload shape ({sub, purpose, fp}, no role). Without
    // this check that token would pass signature verification here and be accepted as a full
    // access token on any JwtAuthGuard-only route -- reject anything that isn't a real access
    // token up front, before it ever reaches a controller.
    if (!Object.values(UserRole).includes(payload.role)) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.disabled) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
