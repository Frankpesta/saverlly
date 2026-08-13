import { INestApplication } from '@nestjs/common';
import { CommissionStatus } from '@prisma/client';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import {
  loginAs,
  seedAnnouncement,
  seedCommissionEvent,
  seedCoupon,
  seedDevice,
  seedKiosk,
  seedLocation,
  seedMerchant,
  seedUser,
} from './utils/fixtures';
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
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
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
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
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
    it("never returns another kiosk's locations in a kiosk-owner's list", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      await seedLocation(kioskA.id);
      await seedLocation(kioskB.id);
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
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
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
      await seedUser({
        email: 'ownerB@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskB.id,
      });
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

    it("restricts a location-manager's device kill-switch to devices at their own location", async () => {
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
      await seedUser({
        email: 'ownerB@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskB.id,
      });
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

    it("never returns another kiosk's announcements in a kiosk-owner's list", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      await seedAnnouncement(kioskA.id);
      await seedAnnouncement(kioskB.id);
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].kioskId).toBe(kioskA.id);
    });

    it('fails closed (empty list, not an error) for a kiosk-owner with no kioskId on their account', async () => {
      await seedUser({
        email: 'orphanOwner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: null,
      });
      const orphanOwnerToken = await loginAs(app, 'orphanOwner@test.com');

      const res = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${orphanOwnerToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it("scopes a location-manager's announcement list to all-location announcements plus their own assigned location", async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id);
      const unmanagedLoc = await seedLocation(kiosk.id);
      const allLocationsAnn = await seedAnnouncement(kiosk.id, {
        title: 'All',
      });
      const managedOnlyAnn = await seedAnnouncement(kiosk.id, {
        title: 'Managed',
        locationIds: [managedLoc.id],
      });
      await seedAnnouncement(kiosk.id, {
        title: 'Unmanaged',
        locationIds: [unmanagedLoc.id],
      });
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

    it("includes platform-wide broadcasts in a kiosk-owner's list, but blocks them from the single-resource routes", async () => {
      const kiosk = await seedKiosk();
      const ownAnn = await seedAnnouncement(kiosk.id);
      const broadcast = await seedAnnouncement(null, { title: 'Broadcast' });
      await seedUser({
        email: 'ownerC@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'ownerC@test.com');

      const res = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const ids = res.body.map((a: { id: string }) => a.id).sort();
      expect(ids).toEqual([ownAnn.id, broadcast.id].sort());

      await request(app.getHttpServer())
        .get(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'hacked' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    it('lets an admin reach the single-resource routes for a broadcast', async () => {
      const broadcast = await seedAnnouncement(null, { title: 'Broadcast' });
      await seedUser({ email: 'admin2@test.com', role: 'ADMIN' });
      const adminToken = await loginAs(app, 'admin2@test.com');

      const res = await request(app.getHttpServer())
        .get(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.id).toBe(broadcast.id);

      await request(app.getHttpServer())
        .patch(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated broadcast' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('blocks a location-manager from creating or reaching the single-resource announcement routes', async () => {
      const kiosk = await seedKiosk();
      const announcement = await seedAnnouncement(kiosk.id);
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${lmToken}`)
        .send({
          title: 'x',
          body: 'y',
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 60_000).toISOString(),
        })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(403);
    });
  });

  describe('Commission Events (Phase 5)', () => {
    it("never returns another kiosk's commission events via /my/commission-events or /my/balance", async () => {
      const kioskA = await seedKiosk({ revenueSharePct: 30 });
      const kioskB = await seedKiosk({ revenueSharePct: 30 });
      const locationA = await seedLocation(kioskA.id);
      const deviceA = await seedDevice(locationA.id);
      const merchant = await seedMerchant();
      await seedCommissionEvent(deviceA.id, merchant.id, {
        status: CommissionStatus.CONFIRMED,
        kioskShareAmount: 9,
      });
      await seedUser({
        email: 'ownerB@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskB.id,
      });
      const ownerBToken = await loginAs(app, 'ownerB@test.com');

      const eventsRes = await request(app.getHttpServer())
        .get('/my/commission-events')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);
      expect(eventsRes.body).toHaveLength(0);

      const balanceRes = await request(app.getHttpServer())
        .get('/my/balance')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);
      expect(balanceRes.body).toEqual({
        pendingAmount: 0,
        confirmedAvailableAmount: 0,
      });
    });

    it('blocks a kiosk-owner from the admin commission-events endpoints entirely', async () => {
      const kiosk = await seedKiosk();
      await seedUser({
        email: 'owner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .get('/commission-events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });
  });

  describe('Payouts (Phase 5)', () => {
    it("never returns another kiosk's payouts via /my/payouts", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      await testPrisma.payout.create({
        data: {
          kioskId: kioskA.id,
          periodStart: new Date(),
          periodEnd: new Date(),
          totalAmount: 12,
          status: 'pending',
        },
      });
      await seedUser({
        email: 'ownerB@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskB.id,
      });
      const ownerBToken = await loginAs(app, 'ownerB@test.com');

      const res = await request(app.getHttpServer())
        .get('/my/payouts')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('blocks a kiosk-owner from the admin payouts endpoints entirely', async () => {
      const kiosk = await seedKiosk();
      const payout = await testPrisma.payout.create({
        data: {
          kioskId: kiosk.id,
          periodStart: new Date(),
          periodEnd: new Date(),
          totalAmount: 12,
          status: 'pending',
        },
      });
      await seedUser({
        email: 'owner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .get('/payouts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/payouts/${payout.id}/process`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });
  });

  describe('Search', () => {
    function resultIds(body: { id: string }[]) {
      return body.map((r) => r.id).sort();
    }

    it("never returns another kiosk's locations, even on a matching name", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      const locationA = await seedLocation(kioskA.id, {
        name: 'Downtown Branch',
      });
      await seedLocation(kioskB.id, { name: 'Downtown Branch' });
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Downtown' })
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual([locationA.id]);
    });

    it("restricts a location-manager's location results to their assigned locations only", async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id, {
        name: 'Central Plaza',
      });
      await seedLocation(kiosk.id, { name: 'Central Plaza' });
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLoc.id],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Central' })
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual([managedLoc.id]);
    });

    it("never returns another kiosk's devices, even on a matching label", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      const locationA = await seedLocation(kioskA.id);
      const locationB = await seedLocation(kioskB.id);
      const deviceA = await seedDevice(locationA.id, 'Computer 4');
      await seedDevice(locationB.id, 'Computer 4');
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Computer' })
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual([deviceA.id]);
    });

    it("restricts a location-manager's device results to devices at their own location", async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id);
      const unmanagedLoc = await seedLocation(kiosk.id);
      const managedDevice = await seedDevice(managedLoc.id, 'Computer 4');
      await seedDevice(unmanagedLoc.id, 'Computer 4');
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLoc.id],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Computer' })
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual([managedDevice.id]);
    });

    it("never returns another kiosk's announcements, even on a matching title", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      const announcementA = await seedAnnouncement(kioskA.id, {
        title: 'Summer Sale',
      });
      await seedAnnouncement(kioskB.id, { title: 'Summer Sale' });
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Summer' })
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual([announcementA.id]);
    });

    it("includes platform-wide broadcasts alongside a kiosk-owner's own announcements", async () => {
      const kiosk = await seedKiosk();
      const ownAnn = await seedAnnouncement(kiosk.id, {
        title: 'Maintenance Notice',
      });
      const broadcast = await seedAnnouncement(null, {
        title: 'Maintenance Notice',
      });
      await seedUser({
        email: 'owner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'owner@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Maintenance' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual([ownAnn.id, broadcast.id].sort());
    });

    it("scopes a location-manager's announcement results to all-location plus their own assigned location", async () => {
      const kiosk = await seedKiosk();
      const managedLoc = await seedLocation(kiosk.id);
      const unmanagedLoc = await seedLocation(kiosk.id);
      const allLocationsAnn = await seedAnnouncement(kiosk.id, {
        title: 'Findable All',
      });
      const managedOnlyAnn = await seedAnnouncement(kiosk.id, {
        title: 'Findable Managed',
        locationIds: [managedLoc.id],
      });
      await seedAnnouncement(kiosk.id, {
        title: 'Findable Unmanaged',
        locationIds: [unmanagedLoc.id],
      });
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLoc.id],
      });
      const lmToken = await loginAs(app, 'lm@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Findable' })
        .set('Authorization', `Bearer ${lmToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual(
        [allLocationsAnn.id, managedOnlyAnn.id].sort(),
      );
    });

    it('never returns kiosks, merchants, or coupons to a kiosk-owner, even matching their own kiosk name', async () => {
      const kiosk = await seedKiosk({ name: 'Acme Kiosk' });
      const merchant = await seedMerchant({ name: 'BigStore' });
      await seedCoupon(merchant.id, { code: 'SAVE10' });
      await seedUser({
        email: 'owner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'owner@test.com');

      const kioskRes = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Acme' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(kioskRes.body).toEqual([]);

      const merchantRes = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'BigStore' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(merchantRes.body).toEqual([]);

      const couponRes = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'SAVE10' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(couponRes.body).toEqual([]);
    });

    it('returns kiosks, merchants, and coupons to an admin', async () => {
      const kiosk = await seedKiosk({ name: 'Acme Kiosk' });
      const merchant = await seedMerchant({ name: 'BigStore' });
      const coupon = await seedCoupon(merchant.id, { code: 'SAVE10' });
      await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
      const adminToken = await loginAs(app, 'admin@test.com');

      const kioskRes = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Acme' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(resultIds(kioskRes.body)).toEqual([kiosk.id]);

      const merchantRes = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'BigStore' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(resultIds(merchantRes.body)).toEqual([merchant.id]);

      const couponRes = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'SAVE10' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(resultIds(couponRes.body)).toEqual([coupon.id]);
    });

    it('fails closed (empty array, not an error) for a kiosk-owner with no kioskId on their account', async () => {
      await seedUser({
        email: 'orphanOwner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: null,
      });
      const orphanOwnerToken = await loginAs(app, 'orphanOwner@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'anything' })
        .set('Authorization', `Bearer ${orphanOwnerToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it("never leaks kioskB's location or announcement into kioskA owner's cross-type results, even on a shared name", async () => {
      const kioskA = await seedKiosk();
      const kioskB = await seedKiosk();
      const locationA = await seedLocation(kioskA.id, { name: 'Riverside' });
      await seedLocation(kioskB.id, { name: 'Riverside' });
      const announcementA = await seedAnnouncement(kioskA.id, {
        title: 'Riverside',
      });
      await seedAnnouncement(kioskB.id, { title: 'Riverside' });
      await seedUser({
        email: 'ownerA@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kioskA.id,
      });
      const ownerAToken = await loginAs(app, 'ownerA@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'Riverside' })
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(resultIds(res.body)).toEqual(
        [announcementA.id, locationA.id].sort(),
      );
    });

    it('returns an empty array for a query shorter than 2 characters', async () => {
      const kiosk = await seedKiosk();
      await seedLocation(kiosk.id, { name: 'A' });
      await seedUser({
        email: 'owner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'owner@test.com');

      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'a' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/search')
        .query({ q: 'anything' })
        .expect(401);
    });
  });
});
