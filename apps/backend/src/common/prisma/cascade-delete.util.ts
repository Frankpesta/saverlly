import { Prisma, PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

type Tx = Prisma.TransactionClient | PrismaClient;

/** Delete unused devices; financial and attribution history prevents hard deletion. */
export async function deleteDevicesCascade(tx: Tx, deviceIds: string[]) {
  if (deviceIds.length === 0) return;
  const where = { deviceId: { in: deviceIds } };
  if (
    (await tx.commissionEvent.count({ where })) ||
    (await tx.attributionAttempt.count({ where }))
  ) {
    throw new ConflictException(
      'Financial and attribution history must be retained. Deactivate or retire these devices instead.',
    );
  }
  await tx.couponTestEvent.deleteMany({ where });
  await tx.deviceToken.deleteMany({ where });
  await tx.device.deleteMany({ where: { id: { in: deviceIds } } });
}

/**
 * Deletes everything a user owns that would otherwise block deleting the user itself. Both
 * `Notification.userId` and `DismissedAlert.userId` are ON DELETE RESTRICT, so a bare
 * `user.delete()` 500s (P2003) once a user has any notification or has dismissed any
 * "Needs attention" item. Every user-delete path routes through here so a future
 * user-owned table only needs adding in one place.
 */
export async function deleteUserOwnedRows(tx: Tx, userIds: string[]) {
  if (userIds.length === 0) return;
  const where = { userId: { in: userIds } };
  await tx.notification.deleteMany({ where });
  await tx.dismissedAlert.deleteMany({ where });
}

export async function deleteLocationsCascade(tx: Tx, locationIds: string[]) {
  if (locationIds.length === 0) return;
  const devices = await tx.device.findMany({
    where: { locationId: { in: locationIds } },
    select: { id: true },
  });
  await deleteDevicesCascade(
    tx,
    devices.map((d) => d.id),
  );
  await tx.locationSetupCode.deleteMany({
    where: { locationId: { in: locationIds } },
  });
  await tx.locationEmployee.deleteMany({
    where: { locationId: { in: locationIds } },
  });
  await tx.location.deleteMany({ where: { id: { in: locationIds } } });
}

/** Delete a merchant only when it has no financial or attribution history. */
export async function deleteMerchantCascade(tx: Tx, merchantId: string) {
  const where = { merchantId };
  if (
    (await tx.commissionEvent.count({ where })) ||
    (await tx.attributionAttempt.count({ where }))
  ) {
    throw new ConflictException(
      'This merchant has financial or attribution history. Deactivate it instead.',
    );
  }
  await tx.couponTestEvent.deleteMany({ where });
  await tx.coupon.deleteMany({ where });
  await tx.merchant.delete({ where: { id: merchantId } });
}

/** Delete an unused kiosk, preserving any kiosk with payout or attribution history. */
export async function deleteKioskCascade(tx: Tx, kioskId: string) {
  if (await tx.payout.count({ where: { kioskId } })) {
    throw new ConflictException(
      'This kiosk has payout history. Deactivate it instead.',
    );
  }
  const [users, locations] = await Promise.all([
    tx.user.findMany({ where: { kioskId }, select: { id: true } }),
    tx.location.findMany({ where: { kioskId }, select: { id: true } }),
  ]);

  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await deleteUserOwnedRows(tx, userIds);
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await deleteLocationsCascade(
    tx,
    locations.map((l) => l.id),
  );
  await tx.announcement.deleteMany({ where: { kioskId } });
  await tx.kiosk.delete({ where: { id: kioskId } });
}
