import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedUser, TEST_PASSWORD } from './utils/fixtures';
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
      .send({
        name: 'Manager One',
        email: 'manager@test.com',
        role: 'LOCATION_MANAGER',
      })
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

  it('stores the email lowercased so a login typed in a different casing later still matches', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    const res = await request(app.getHttpServer())
      .post(`/kiosks/${kiosk.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Manager Test',
        email: 'Manager.Test@Example.COM',
        role: 'LOCATION_MANAGER',
      })
      .expect(201);

    expect(res.body.user.email).toBe('manager.test@example.com');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'MANAGER.TEST@example.com',
        password: res.body.generatedPassword,
      })
      .expect(200);
  });

  it('rejects a request that still supplies a password field (no longer accepted)', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .post(`/kiosks/${kiosk.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Manager Two',
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
      .send({
        name: 'Late Owner',
        email: 'lateowner@test.com',
        role: 'KIOSK_OWNER',
      })
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
      .send({ name: 'Peer Owner', email: 'peer@test.com', role: 'KIOSK_OWNER' })
      .expect(403);
  });

  // UpdateKioskUserDto had no `email` field at all, so a team member's sign-in address was
  // unchangeable by anyone once the account existed.
  describe('changing a team member’s email', () => {
    async function seedOwnerAndManager() {
      const kiosk = await seedKiosk();
      await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
      const manager = await seedUser({
        email: 'manager@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [],
      });
      return { kiosk, manager, token: await loginAs(app, 'owner@test.com') };
    }

    it('updates the email, and the member can sign in with it', async () => {
      const { kiosk, manager, token } = await seedOwnerAndManager();

      await request(app.getHttpServer())
        .patch(`/kiosks/${kiosk.id}/users/${manager.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'renamed@test.com' })
        .expect(200)
        .expect((res) => expect(res.body.email).toBe('renamed@test.com'));

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'renamed@test.com', password: TEST_PASSWORD })
        .expect(200);
    });

    // Left to Prisma this surfaces as an unmapped P2002 and a 500, which the form can't act on.
    it('409s when the email is already in use', async () => {
      const { kiosk, manager, token } = await seedOwnerAndManager();

      await request(app.getHttpServer())
        .patch(`/kiosks/${kiosk.id}/users/${manager.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'owner@test.com' })
        .expect(409);
    });

    it('rejects a malformed email', async () => {
      const { kiosk, manager, token } = await seedOwnerAndManager();

      await request(app.getHttpServer())
        .patch(`/kiosks/${kiosk.id}/users/${manager.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  // The client reported never receiving a new team member's first-time password. There was no
  // recovery path: the old one could not be read and a new one could not be issued.
  describe('re-issuing a first-time password', () => {
    it('rotates the password, re-flags the account, and returns the new value', async () => {
      const kiosk = await seedKiosk();
      await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
      const manager = await seedUser({
        email: 'manager@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        mustChangePassword: false,
      });
      const token = await loginAs(app, 'owner@test.com');

      const res = await request(app.getHttpServer())
        .post(`/kiosks/${kiosk.id}/users/${manager.id}/resend-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(typeof res.body.generatedPassword).toBe('string');
      expect(res.body.user.mustChangePassword).toBe(true);

      const row = await testPrisma.user.findUniqueOrThrow({ where: { id: manager.id } });
      await expect(
        bcrypt.compare(res.body.generatedPassword, row.passwordHash),
      ).resolves.toBe(true);

      // The old password stops working, and the new one is real.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'manager@test.com', password: TEST_PASSWORD })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'manager@test.com', password: res.body.generatedPassword })
        .expect(200);
    });

    it('re-sends the welcome notification', async () => {
      const kiosk = await seedKiosk();
      await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
      const manager = await seedUser({
        email: 'manager@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
      });
      const token = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .post(`/kiosks/${kiosk.id}/users/${manager.id}/resend-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const notification = await testPrisma.notification.findFirstOrThrow({
        where: { userId: manager.id },
      });
      expect(notification.type).toBe('LOCATION_MANAGER_CREATED');
    });

    it('refuses a kiosk-owner acting on a peer owner', async () => {
      const kiosk = await seedKiosk();
      await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
      const peer = await seedUser({
        email: 'peer@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const token = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .post(`/kiosks/${kiosk.id}/users/${peer.id}/resend-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('404s for a user who does not belong to this kiosk', async () => {
      const kiosk = await seedKiosk();
      const otherKiosk = await seedKiosk();
      await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
      const stranger = await seedUser({
        email: 'stranger@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: otherKiosk.id,
      });
      const token = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .post(`/kiosks/${kiosk.id}/users/${stranger.id}/resend-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
