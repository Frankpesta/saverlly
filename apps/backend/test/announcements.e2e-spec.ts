import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedAnnouncement, seedKiosk, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Announcements (e2e)', () => {
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

  async function ownerCtx() {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
    const token = await loginAs(app, 'owner@test.com');
    return { kiosk, token };
  }

  it('creates an announcement with default ONCE repeat policy when omitted', async () => {
    const { token } = await ownerCtx();
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Sale', body: 'Big sale today', startAt, endAt })
      .expect(201);

    expect(res.body.repeatPolicy).toBe('ONCE');
    expect(res.body.locationIds).toEqual([]);
  });

  it('rejects endAt <= startAt', async () => {
    const { token } = await ownerCtx();
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() - 1000).toISOString();

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad', body: 'Bad', startAt, endAt })
      .expect(400);
  });

  it('requires maxDisplayCount when repeatPolicy is MAX_N_TIMES', async () => {
    const { token } = await ownerCtx();
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad', body: 'Bad', startAt, endAt, repeatPolicy: 'MAX_N_TIMES' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ok', body: 'Ok', startAt, endAt, repeatPolicy: 'MAX_N_TIMES', maxDisplayCount: 3 })
      .expect(201);
  });

  it('updates an announcement and re-validates the date window against the merged result', async () => {
    const { kiosk, token } = await ownerCtx();
    const startAt = new Date();
    const endAt = new Date(Date.now() + 3_600_000);
    const announcement = await seedAnnouncement(kiosk.id, { startAt, endAt });

    // Only moving startAt to after the existing endAt should fail using the merged window.
    await request(app.getHttpServer())
      .patch(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startAt: new Date(endAt.getTime() + 1000).toISOString() })
      .expect(400);

    const res = await request(app.getHttpServer())
      .patch(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' })
      .expect(200);
    expect(res.body.title).toBe('Updated');
  });

  it('deletes an announcement', async () => {
    const { kiosk, token } = await ownerCtx();
    const announcement = await seedAnnouncement(kiosk.id);

    await request(app.getHttpServer())
      .delete(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // TenantScopeGuard resolves the resource before the service runs, so a missing
    // resource fails the tenant check first (403) rather than reaching the service's 404.
    await request(app.getHttpServer())
      .get(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('401s every route with no auth token', async () => {
    await request(app.getHttpServer()).get('/announcements').expect(401);
    await request(app.getHttpServer()).post('/announcements').send({}).expect(401);
  });
});
