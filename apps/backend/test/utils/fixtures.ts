import { INestApplication } from '@nestjs/common';
import { AnnouncementRepeatPolicy, AttributionMethod, CommissionStatus, CouponSource, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import request from 'supertest';
import { testPrisma } from './db';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const TEST_PASSWORD = 'TestPassword123!';

export async function seedKiosk(overrides: Partial<{ name: string; revenueSharePct: number }> = {}) {
  return testPrisma.kiosk.create({
    data: {
      name: overrides.name ?? `Kiosk ${Math.random().toString(36).slice(2, 8)}`,
      revenueSharePct: overrides.revenueSharePct ?? 30,
      contactEmail: 'contact@test.com',
    },
  });
}

export async function seedUser(params: {
  email: string;
  role: UserRole;
  kioskId?: string | null;
  managedLocationIds?: string[];
  disabled?: boolean;
}) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  return testPrisma.user.create({
    data: {
      email: params.email,
      passwordHash,
      role: params.role,
      kioskId: params.kioskId ?? null,
      managedLocationIds: params.managedLocationIds ?? [],
      disabled: params.disabled ?? false,
    },
  });
}

export async function seedLocation(kioskId: string, overrides: Partial<{ name: string }> = {}) {
  return testPrisma.location.create({
    data: {
      kioskId,
      name: overrides.name ?? `Location ${Math.random().toString(36).slice(2, 8)}`,
      address: '1 Main St',
      city: 'City',
      state: 'ST',
      country: 'US',
    },
  });
}

export async function seedDevice(locationId: string, label = 'Test Device') {
  return testPrisma.device.create({ data: { locationId, label } });
}

export async function seedDeviceWithToken(locationId: string, label = 'Test Device') {
  const device = await seedDevice(locationId, label);
  const rawToken = randomBytes(32).toString('base64url');
  await testPrisma.deviceToken.create({ data: { deviceId: device.id, tokenHash: hashToken(rawToken) } });
  return { device, rawToken };
}

export async function seedMerchant(
  overrides: Partial<{
    name: string;
    domain: string;
    attributionMethod: AttributionMethod;
    affiliateTrackingUrl: string;
    active: boolean;
    checkoutRecipe: object;
    affiliateProgramId: string;
    affiliateSubIdParamKey: string;
  }> = {},
) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return testPrisma.merchant.create({
    data: {
      name: overrides.name ?? `Merchant ${suffix}`,
      domain: overrides.domain ?? `merchant-${suffix}.test`,
      attributionMethod: overrides.attributionMethod ?? AttributionMethod.COOKIE,
      affiliateTrackingUrl: overrides.affiliateTrackingUrl ?? 'https://track.example.com',
      active: overrides.active ?? true,
      checkoutRecipe: overrides.checkoutRecipe as never,
      affiliateProgramId: overrides.affiliateProgramId,
      affiliateSubIdParamKey: overrides.affiliateSubIdParamKey,
    },
  });
}

export async function seedAttributionAttempt(
  deviceId: string,
  merchantId: string,
  overrides: Partial<{ subId: string; createdAt: Date }> = {},
) {
  return testPrisma.attributionAttempt.create({
    data: {
      deviceId,
      merchantId,
      subId: overrides.subId ?? `subid-${randomBytes(8).toString('hex')}`,
      createdAt: overrides.createdAt,
    },
  });
}

export async function seedCoupon(
  merchantId: string,
  overrides: Partial<{ code: string; source: CouponSource; active: boolean }> = {},
) {
  return testPrisma.coupon.create({
    data: {
      merchantId,
      code: overrides.code ?? `CODE${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      source: overrides.source ?? CouponSource.MANUAL,
      active: overrides.active ?? true,
    },
  });
}

export async function seedAffiliateProgram(overrides: Partial<{ networkName: string; hasCouponApi: boolean }> = {}) {
  return testPrisma.affiliateProgram.create({
    data: {
      networkName: overrides.networkName ?? 'TestNetwork',
      hasCouponApi: overrides.hasCouponApi ?? false,
    },
  });
}

export async function seedAnnouncement(
  kioskId: string,
  overrides: Partial<{
    locationIds: string[];
    title: string;
    body: string;
    startAt: Date;
    endAt: Date;
    repeatPolicy: AnnouncementRepeatPolicy;
    maxDisplayCount: number;
  }> = {},
) {
  const now = Date.now();
  return testPrisma.announcement.create({
    data: {
      kioskId,
      locationIds: overrides.locationIds ?? [],
      title: overrides.title ?? 'Test Announcement',
      body: overrides.body ?? 'Test body',
      startAt: overrides.startAt ?? new Date(now - 60_000),
      endAt: overrides.endAt ?? new Date(now + 60_000),
      repeatPolicy: overrides.repeatPolicy ?? AnnouncementRepeatPolicy.ONCE,
      maxDisplayCount: overrides.maxDisplayCount,
    },
  });
}

export async function seedCommissionEvent(
  deviceId: string,
  merchantId: string,
  overrides: Partial<{
    status: CommissionStatus;
    commissionAmount: number;
    kioskShareAmount: number;
    orderValue: number;
    confirmedAt: Date;
    networkReference: string;
  }> = {},
) {
  return testPrisma.commissionEvent.create({
    data: {
      deviceId,
      merchantId,
      networkReference: overrides.networkReference ?? `NETREF-${Math.random().toString(36).slice(2, 10)}`,
      orderValue: overrides.orderValue ?? 49.99,
      commissionAmount: overrides.commissionAmount ?? 5,
      kioskShareAmount: overrides.kioskShareAmount ?? 0,
      status: overrides.status ?? CommissionStatus.PENDING,
      reportedAt: new Date(),
      confirmedAt: overrides.status === CommissionStatus.CONFIRMED ? (overrides.confirmedAt ?? new Date()) : undefined,
    },
  });
}

export async function loginAs(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return res.body.accessToken;
}
