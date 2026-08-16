import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  kioskId: string | null;
  mustChangePassword: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  // Random nonce so two refreshes issued within the same iat-second never collide —
  // JWT signing is otherwise deterministic for an identical header+payload+secret.
  jti: string;
}
