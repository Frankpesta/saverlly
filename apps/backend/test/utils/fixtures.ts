import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { testPrisma } from './db';

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

export async function loginAs(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return res.body.accessToken;
}
