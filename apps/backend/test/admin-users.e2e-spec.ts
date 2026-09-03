import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Admin-level teammates (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('lets an ADMIN create another ADMIN and returns a server-generated password once', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    const res = await request(app.getHttpServer())
      .post('/users/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Teammate', email: 'teammate@test.com' })
      .expect(201);

    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.email).toBe('teammate@test.com');
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(typeof res.body.generatedPassword).toBe('string');
    expect(res.body.generatedPassword.length).toBeGreaterThanOrEqual(16);

    const row = await testPrisma.user.findUniqueOrThrow({ where: { email: 'teammate@test.com' } });
    await expect(bcrypt.compare(res.body.generatedPassword, row.passwordHash)).resolves.toBe(true);
    expect(row.kioskId).toBeNull();

    // The new admin can actually log in with it.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'teammate@test.com', password: res.body.generatedPassword })
      .expect(200);
  });

  it('409s creating an admin with an email already in use', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .post('/users/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup', email: 'admin@test.com' })
      .expect(409);
  });

  it('lists every admin', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    await seedUser({ email: 'second-admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    const res = await request(app.getHttpServer())
      .get('/users/admins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true);
  });

  it('403s for a non-ADMIN (kiosk owner) trying to list or create admins', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
    const token = await loginAs(app, 'owner@test.com');

    await request(app.getHttpServer())
      .get('/users/admins')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/users/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope', email: 'nope@test.com' })
      .expect(403);
  });

  it('disables another admin, which immediately blocks their already-issued token', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const otherAdmin = await seedUser({ email: 'other-admin@test.com', role: 'ADMIN' });
    const adminToken = await loginAs(app, 'admin@test.com');
    const otherToken = await loginAs(app, 'other-admin@test.com');

    await request(app.getHttpServer())
      .patch(`/users/admins/${otherAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disabled: true })
      .expect(200);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(401);
  });

  it('deletes another admin, but 400s trying to delete your own account', async () => {
    const admin = await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const otherAdmin = await seedUser({ email: 'other-admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .delete(`/users/admins/${otherAdmin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await expect(
      testPrisma.user.findUnique({ where: { id: otherAdmin.id } }),
    ).resolves.toBeNull();

    await request(app.getHttpServer())
      .delete(`/users/admins/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  // DismissedAlert.userId is ON DELETE RESTRICT, so once the "Needs attention" dismissal
  // feature landed, deleting any admin who had dismissed something 500'd on a raw P2003.
  it('deletes an admin who has dismissed a Needs Attention alert', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const otherAdmin = await seedUser({ email: 'other-admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await testPrisma.dismissedAlert.create({
      data: { userId: otherAdmin.id, alertKey: 'kiosks-inactive' },
    });

    await request(app.getHttpServer())
      .delete(`/users/admins/${otherAdmin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await expect(
      testPrisma.user.findUnique({ where: { id: otherAdmin.id } }),
    ).resolves.toBeNull();
    await expect(
      testPrisma.dismissedAlert.findMany({ where: { userId: otherAdmin.id } }),
    ).resolves.toHaveLength(0);
  });

  it('records, lists, and clears the caller’s own dismissed alerts', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .get('/users/me/dismissed-alerts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect([]);

    // Dismissing is idempotent, the same key twice must not 409 on the unique constraint.
    for (let i = 0; i < 2; i += 1) {
      await request(app.getHttpServer())
        .post('/users/me/dismissed-alerts')
        .set('Authorization', `Bearer ${token}`)
        .send({ alertKey: 'kiosks-inactive' })
        .expect(204);
    }

    await request(app.getHttpServer())
      .get('/users/me/dismissed-alerts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(['kiosks-inactive']);

    await request(app.getHttpServer())
      .delete('/users/me/dismissed-alerts/kiosks-inactive')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/users/me/dismissed-alerts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect([]);
  });

  it("never shows one admin's dismissals to another", async () => {
    const a = await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    await seedUser({ email: 'other-admin@test.com', role: 'ADMIN' });
    await testPrisma.dismissedAlert.create({
      data: { userId: a.id, alertKey: 'payouts-pending' },
    });

    const otherToken = await loginAs(app, 'other-admin@test.com');
    await request(app.getHttpServer())
      .get('/users/me/dismissed-alerts')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
      .expect([]);
  });
});
