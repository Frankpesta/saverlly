import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedNotification, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Notifications (e2e)', () => {
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

  it("only returns the current user's own notifications, newest first", async () => {
    const userA = await seedUser({ email: 'a@test.com', role: 'ADMIN' });
    const userB = await seedUser({ email: 'b@test.com', role: 'ADMIN' });
    const older = await seedNotification(userA.id, { title: 'Older' });
    // Ensure a distinct createdAt ordering (DB default timestamp resolution).
    await new Promise((r) => setTimeout(r, 10));
    const newer = await seedNotification(userA.id, { title: 'Newer' });
    await seedNotification(userB.id, { title: "Not A's" });

    const token = await loginAs(app, 'a@test.com');
    const res = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.map((n: { id: string }) => n.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('counts only unread notifications for the current user', async () => {
    const user = await seedUser({ email: 'a@test.com', role: 'ADMIN' });
    await seedNotification(user.id, { readAt: new Date() });
    await seedNotification(user.id);
    await seedNotification(user.id);

    const token = await loginAs(app, 'a@test.com');
    const res = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ count: 2 });
  });

  it('marks a notification read and reflects it in unread-count', async () => {
    const user = await seedUser({ email: 'a@test.com', role: 'ADMIN' });
    const notification = await seedNotification(user.id);

    const token = await loginAs(app, 'a@test.com');
    const readRes = await request(app.getHttpServer())
      .patch(`/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Must be real JSON, not an empty body — a bare `void` return breaks browser fetch's res.json().
    expect(readRes.body).toEqual({ success: true });

    const updated = await testPrisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(updated.readAt).not.toBeNull();

    const countRes = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(countRes.body).toEqual({ count: 0 });
  });

  it("404s when marking another user's notification as read", async () => {
    const userA = await seedUser({ email: 'a@test.com', role: 'ADMIN' });
    await seedUser({ email: 'b@test.com', role: 'ADMIN' });
    const notification = await seedNotification(userA.id);

    const tokenB = await loginAs(app, 'b@test.com');
    await request(app.getHttpServer())
      .patch(`/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("marks all of the current user's notifications read, leaving other users' untouched", async () => {
    const userA = await seedUser({ email: 'a@test.com', role: 'ADMIN' });
    const userB = await seedUser({ email: 'b@test.com', role: 'ADMIN' });
    await seedNotification(userA.id);
    await seedNotification(userA.id);
    await seedNotification(userB.id);

    const tokenA = await loginAs(app, 'a@test.com');
    const readAllRes = await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(readAllRes.body).toEqual({ success: true });

    const aUnread = await testPrisma.notification.count({
      where: { userId: userA.id, readAt: null },
    });
    const bUnread = await testPrisma.notification.count({
      where: { userId: userB.id, readAt: null },
    });
    expect(aUnread).toBe(0);
    expect(bUnread).toBe(1);
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(401);
  });
});
