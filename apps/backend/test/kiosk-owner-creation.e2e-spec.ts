import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import { loginAs, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Kiosk + owner creation (e2e)', () => {
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

  it('creates a kiosk and its owner atomically, returning a generated password once', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    const res = await request(app.getHttpServer())
      .post('/kiosks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Kiosk',
        revenueSharePct: 25,
        owner: { name: 'Kiosk Owner', email: 'owner@newkiosk.test' },
      })
      .expect(201);

    expect(res.body.kiosk.name).toBe('New Kiosk');
    expect(res.body.owner.email).toBe('owner@newkiosk.test');
    expect(res.body.owner.role).toBe('KIOSK_OWNER');
    expect(res.body.owner.kioskId).toBe(res.body.kiosk.id);
    expect(res.body.owner.mustChangePassword).toBe(true);
    expect(res.body.owner.passwordHash).toBeUndefined();
    expect(typeof res.body.generatedPassword).toBe('string');
    expect(res.body.generatedPassword.length).toBeGreaterThanOrEqual(16);

    const userRow = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'owner@newkiosk.test' },
    });
    expect(userRow.kioskId).toBe(res.body.kiosk.id);
    expect(userRow.mustChangePassword).toBe(true);
    await expect(
      bcrypt.compare(res.body.generatedPassword, userRow.passwordHash),
    ).resolves.toBe(true);

    const notification = await testPrisma.notification.findFirstOrThrow({
      where: { userId: userRow.id },
    });
    expect(notification.type).toBe('KIOSK_OWNER_CREATED');

    // The generated password actually works to log in.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'owner@newkiosk.test',
        password: res.body.generatedPassword,
      })
      .expect(200);
  });

  it('rejects kiosk creation with no owner object', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .post('/kiosks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No Owner Kiosk',
        revenueSharePct: 25,
      })
      .expect(400);
  });

  it('rejects kiosk creation for a non-admin', async () => {
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER' });
    const ownerToken = await loginAs(app, 'owner@test.com');

    await request(app.getHttpServer())
      .post('/kiosks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Blocked Kiosk',
        revenueSharePct: 25,
        owner: { name: 'Owner Two', email: 'owner2@blocked.test' },
      })
      .expect(403);
  });

  it('does not create a kiosk row at all if the request is invalid', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .post('/kiosks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad',
        revenueSharePct: 25,
        owner: { name: 'Bad Owner', email: 'not-an-email' },
      })
      .expect(400);

    const count = await testPrisma.kiosk.count();
    expect(count).toBe(0);
  });
});
