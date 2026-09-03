import { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Deletes a set of devices and everything that hangs off them (device tokens, coupon test
 * events, attribution attempts, commission events). None of those relations cascade at the
 * schema level, so a bare `device.delete()` 500s (P2003) the moment a device has any real
 * activity history. Used both for a single device delete and for cascading through every
 * device at a location that's being deleted.
 */
export async function deleteDevicesCascade(tx: Tx, deviceIds: string[]) {
  if (deviceIds.length === 0) return;
  const where = { deviceId: { in: deviceIds } };
  await tx.commissionEvent.deleteMany({ where });
  await tx.attributionAttempt.deleteMany({ where });
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
  await tx.location.deleteMany({ where: { id: { in: locationIds } } });
}

/**
 * Deletes a merchant and everything that hangs off it. `Coupon`, `CouponTestEvent`,
 * `AttributionAttempt`, and `CommissionEvent` all reference `merchantId` with ON DELETE
 * RESTRICT, so a bare `merchant.delete()` throws an unmapped P2003 (surfacing as a 500) the
 * moment a merchant has ever had a coupon or a conversion. `ScrapeSource.merchantId` is
 * ON DELETE SET NULL, so those rows survive deliberately and just become unattached.
 *
 * Ordered so nothing is still referenced when it is removed: commission events reference
 * coupons, and coupon test events reference coupons, so both go before the coupons do.
 */
export async function deleteMerchantCascade(tx: Tx, merchantId: string) {
  const where = { merchantId };
  await tx.commissionEvent.deleteMany({ where });
  await tx.attributionAttempt.deleteMany({ where });
  await tx.couponTestEvent.deleteMany({ where });
  await tx.coupon.deleteMany({ where });
  await tx.merchant.delete({ where: { id: merchantId } });
}

/**
 * Deletes a kiosk and everything under it: users (and their notifications), locations (and
 * every device + device history under each, via `deleteLocationsCascade`), kiosk-scoped
 * announcements (broadcast announcements have a null kioskId and are untouched), and payouts.
 * Payouts are deleted last since a `CommissionEvent.payoutId` referencing one would otherwise
 * block it. By the time we get here every commission event under this kiosk's own devices is
 * already gone, so nothing should still reference these payouts.
 */
export async function deleteKioskCascade(tx: Tx, kioskId: string) {
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
  await tx.payout.deleteMany({ where: { kioskId } });
  await tx.kiosk.delete({ where: { id: kioskId } });
}
