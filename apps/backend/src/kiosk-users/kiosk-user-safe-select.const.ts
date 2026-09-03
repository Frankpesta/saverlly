// Shared Prisma `select` shape for any User row returned to a client. Deliberately
// excludes passwordHash/refreshTokenHash. Used by kiosk-users.service.ts and by
// kiosks.service.ts's atomic kiosk+owner creation, so both call sites stay in sync.
export const KIOSK_USER_SAFE_SELECT = {
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
