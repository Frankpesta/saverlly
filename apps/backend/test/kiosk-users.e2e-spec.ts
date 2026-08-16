import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Kiosk users — server-generated password (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetRedisTestDb();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
    await resetRedisTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('generates a password server-side for a new LOCATION_MANAGER and returns it once', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    const res = await request(app.getHttpServer())
      .post(`/kiosks/${kiosk.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'manager@test.com', role: 'LOCATION_MANAGER' })
      .expect(201);

    expect(res.body.user.email).toBe('manager@test.com');
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(typeof res.body.generatedPassword).toBe('string');
    expect(res.body.generatedPassword.length).toBeGreaterThanOrEqual(16);

    const userRow = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'manager@test.com' },
    });
    await expect(
      bcrypt.compare(res.body.generatedPassword, userRow.passwordHash),
    ).resolves.toBe(true);

    const notification = await testPrisma.notification.findFirstOrThrow({
      where: { userId: userRow.id },
    });
    expect(notification.type).toBe('LOCATION_MANAGER_CREATED');
  });

  it('rejects a request that still supplies a password field (no longer accepted)', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .post(`/kiosks/${kiosk.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'manager2@test.com',
        role: 'LOCATION_MANAGER',
        password: 'IgnoredPassword123!',
      })
      .expect(400);
  });

  it('fires a KIOSK_OWNER_CREATED trigger when an admin creates an owner for an existing ownerless kiosk', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    const res = await request(app.getHttpServer())
      .post(`/kiosks/${kiosk.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'lateowner@test.com', role: 'KIOSK_OWNER' })
      .expect(201);

    const userRow = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'lateowner@test.com' },
    });
    const notification = await testPrisma.notification.findFirstOrThrow({
      where: { userId: userRow.id },
    });
    expect(notification.type).toBe('KIOSK_OWNER_CREATED');
    expect(res.body.generatedPassword).toEqual(expect.any(String));
  });

  it('still blocks a kiosk-owner from assigning a peer KIOSK_OWNER (tenant isolation unaffected)', async () => {
    const kiosk = await seedKiosk();
    await seedUser({
      email: 'owner@test.com',
      role: 'KIOSK_OWNER',
      kioskId: kiosk.id,
    });
    const ownerToken = await loginAs(app, 'owner@test.com');

    await request(app.getHttpServer())
      .post(`/kiosks/${kiosk.id}/users`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'peer@test.com', role: 'KIOSK_OWNER' })
      .expect(403);
  });
});
