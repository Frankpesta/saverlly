import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedAnnouncement, seedDevice, seedKiosk, seedLocation, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Tenant isolation (e2e)', () => {
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

  describe('Kiosks', () => {
    it('lets a kiosk-owner read their own kiosk but not another kiosk', async () => {
      const kioskA = await seedKiosk({ name: 'Kiosk A' });
      const kioskB = await seedKiosk({ name: 'Kiosk B' });
      await seedUser({ email: 'ownerA@test.com', role: 'KIOSK_OWNER', kioskId: kioskA.id });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      await request(app.getHttpServer())
        .get(`/kiosks/${kioskA.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/kiosks/${kioskB.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(403);
    });

    it('blocks a kiosk-owner from listing or creating kiosks (admin-only)', async () => {
      const kioskA = await seedKiosk();
      await seedUser({ email: 'ownerA@test.com', role: 'KIOSK_OWNER', kioskId: kioskA.id });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      await request(app.getHttpServer())
        .get('/kiosks')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/kiosks')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: 'x', revenueSharePct: 10, contactEmail: 'x@test.com' })
        .expect(403);
    });

    it('lets admin reach any kiosk', async () => {
      const kioskA = await seedKiosk();
      await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
      const adminToken = await loginAs(app, 'admin@test.com');

      await request(app.getHttpServer())
        .get(`/kiosks/${kioskA.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Locations', () => {
    it('never returns another kiosk\'s locations in a kiosk-owner\'s list', async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      await seedLocation(kioskA.id);
      await seedLocation(kioskB.id);
      await seedUser({ email: 'ownerA@test.com', role: 'KIOSK_OWNER', kioskId: kioskA.id });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/locations')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].kioskId).toBe(kioskA.id);
    });

    it('restricts a location-manager to their own assigned locations only', async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id, { name: 'Managed' });
      const unmanagedLoc = await seedLocation(kiosk.id, { name: 'Unmanaged' });
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLoc.id],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      const listRes = await request(app.getHttpServer())
        .get('/locations')
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(managedLoc.id);

      await request(app.getHttpServer())
        .get(`/locations/${managedLoc.id}`)
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/locations/${unmanagedLoc.id}`)
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(403);
    });
  });

  describe('Devices', () => {
    it('blocks cross-tenant device access even when the device id is known', async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      const locationA = await seedLocation(kioskA.id);
      const deviceA = await seedDevice(locationA.id);
      await seedUser({ email: 'ownerA@test.com', role: 'KIOSK_OWNER', kioskId: kioskA.id });
      await seedUser({ email: 'ownerB@test.com', role: 'KIOSK_OWNER', kioskId: kioskB.id });
      const ownerBToken = await loginAs(app, 'ownerB@test.com');

      await request(app.getHttpServer())
        .get(`/devices/${deviceA.id}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/devices/${deviceA.id}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ active: false })
        .expect(403);
    });

    it('restricts a location-manager\'s device kill-switch to devices at their own location', async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id);
      const unmanagedLoc = await seedLocation(kiosk.id);
      const managedDevice = await seedDevice(managedLoc.id);
      const unmanagedDevice = await seedDevice(unmanagedLoc.id);
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLoc.id],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      await request(app.getHttpServer())
        .patch(`/devices/${managedDevice.id}`)
        .set('Authorization', `Bearer ${lmToken}`)
        .send({ active: false })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/devices/${unmanagedDevice.id}`)
        .set('Authorization', `Bearer ${lmToken}`)
        .send({ active: false })
        .expect(403);
    });
  });

  describe('Announcements', () => {
    it('blocks cross-tenant announcement access even when the announcement id is known', async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      const announcementA = await seedAnnouncement(kioskA.id);
      await seedUser({ email: 'ownerB@test.com', role: 'KIOSK_OWNER', kioskId: kioskB.id });
      const ownerBToken = await loginAs(app, 'ownerB@test.com');

      await request(app.getHttpServer())
        .get(`/announcements/${announcementA.id}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/announcements/${announcementA.id}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ title: 'hacked' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/announcements/${announcementA.id}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(403);
    });

    it('never returns another kiosk\'s announcements in a kiosk-owner\'s list', async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      await seedAnnouncement(kioskA.id);
      await seedAnnouncement(kioskB.id);
      await seedUser({ email: 'ownerA@test.com', role: 'KIOSK_OWNER', kioskId: kioskA.id });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].kioskId).toBe(kioskA.id);
    });

    it('scopes a location-manager\'s announcement list to all-location announcements plus their own assigned location', async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id);
      const unmanagedLoc = await seedLocation(kiosk.id);
      const allLocationsAnn = await seedAnnouncement(kiosk.id, { title: 'All' });
      const managedOnlyAnn = await seedAnnouncement(kiosk.id, { title: 'Managed', locationIds: [managedLoc.id] });
      await seedAnnouncement(kiosk.id, { title: 'Unmanaged', locationIds: [unmanagedLoc.id] });
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLoc.id],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      const res = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(200);

      const ids = res.body.map((a: { id: string }) => a.id).sort();
      expect(ids).toEqual([allLocationsAnn.id, managedOnlyAnn.id].sort());
    });

    it('blocks a location-manager from creating or reaching the single-resource announcement routes', async () => {
      const kiosk = await seedKiosk();
      const announcement = await seedAnnouncement(kiosk.id);
      await seedUser({ email: 'lm@test.com', role: 'LOCATION_MANAGER', kioskId: kiosk.id, managedLocationIds: [] });
      const lmToken = await loginAs(app, 'lm@test.com');

      await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${lmToken}`)
        .send({ title: 'x', body: 'y', startAt: new Date().toISOString(), endAt: new Date(Date.now() + 60_000).toISOString() })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(403);
    });
  });
});
