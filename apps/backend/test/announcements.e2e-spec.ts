import * as fs from 'fs';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { AnnouncementRepeatPolicy } from '@prisma/client';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import {
  loginAs,
  seedAnnouncement,
  seedKiosk,
  seedLocation,
  seedUser,
} from './utils/fixtures';
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
    await seedUser({
      email: 'owner@test.com',
      role: 'KIOSK_OWNER',
      kioskId: kiosk.id,
    });
    const token = await loginAs(app, 'owner@test.com');
    return { kiosk, token };
  }

  async function adminCtx() {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');
    return { token };
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

  describe('canvas layout', () => {
    const window = () => ({
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    it('stores the sanitized layout, not the JSON the client sent', async () => {
      const { token } = await ownerCtx();

      const res = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Designed',
          body: 'Has a layout',
          ...window(),
          layout: {
            version: 1,
            background: '#ffffff',
            elements: [
              // Every field here is hostile or out of range, and none of it may survive to the
              // kiosk — the agent turns these values straight into an HTML document.
              {
                type: 'text',
                text: 'hi',
                color: 'red; background:url(javascript:alert(1))',
                fontFamily: 'Comic Sans MS',
                fontSize: 99999,
                x: 10,
                y: 10,
                width: 100,
                height: 40,
              },
              { type: 'image', url: 'javascript:alert(1)', x: 0, y: 0, width: 50, height: 50 },
            ],
          },
        })
        .expect(201);

      const [text, ...rest] = res.body.layout.elements;
      // The bad image element is dropped entirely rather than stored as an unrenderable hole.
      expect(rest).toHaveLength(0);
      expect(text.color).toBe('#111111');
      expect(text.fontFamily).toBe('Segoe UI');
      expect(text.fontSize).toBe(200);
    });

    it('rejects a layout that is not an object at all', async () => {
      const { token } = await ownerCtx();

      await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Bad', body: 'Bad', ...window(), layout: 'not-a-layout' })
        .expect(400);
    });

    it('defaults to no layout, and round-trips a good one through PATCH', async () => {
      const { token } = await ownerCtx();

      const created = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Plain', body: 'No design', ...window() })
        .expect(201);
      expect(created.body.layout).toBeNull();

      const patched = await request(app.getHttpServer())
        .patch(`/announcements/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          layout: {
            version: 1,
            background: '#0b0b0b',
            elements: [
              {
                type: 'button',
                label: 'Close',
                x: 10,
                y: 10,
                width: 120,
                height: 40,
                backgroundColor: '#0f766e',
              },
            ],
          },
        })
        .expect(200);

      expect(patched.body.layout.background).toBe('#0b0b0b');
      expect(patched.body.layout.elements[0].label).toBe('Close');
    });
  });

  it('accepts a localhost mediaUrl, as returned by its own upload endpoint', async () => {
    // Same require_tld regression as CreatePromotionDto — a just-uploaded image's URL must be
    // usable in the very next create call on a dev machine.
    const { token } = await ownerCtx();
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'With image',
        body: 'Body',
        startAt,
        endAt,
        mediaUrl: 'http://localhost:3000/uploads/announcements/a.png',
      })
      .expect(201);
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
      .send({
        title: 'Bad',
        body: 'Bad',
        startAt,
        endAt,
        repeatPolicy: 'MAX_N_TIMES',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Ok',
        body: 'Ok',
        startAt,
        endAt,
        repeatPolicy: 'MAX_N_TIMES',
        maxDisplayCount: 3,
      })
      .expect(201);
  });

  it('rejects a locationId that belongs to another kiosk', async () => {
    const { kiosk, token } = await ownerCtx();
    const otherKiosk = await seedKiosk();
    const otherLocation = await seedLocation(otherKiosk.id);
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bad',
        body: 'Bad',
        startAt,
        endAt,
        locationIds: [otherLocation.id],
      })
      .expect(400);
  });

  it('rejects a locationId that does not exist', async () => {
    const { token } = await ownerCtx();
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bad',
        body: 'Bad',
        startAt,
        endAt,
        locationIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(400);
  });

  it("accepts a locationId that belongs to the caller's own kiosk", async () => {
    const { kiosk, token } = await ownerCtx();
    const location = await seedLocation(kiosk.id);
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Ok',
        body: 'Ok',
        startAt,
        endAt,
        locationIds: [location.id],
      })
      .expect(201);

    expect(res.body.locationIds).toEqual([location.id]);
  });

  it('rejects updating an announcement with a locationId from another kiosk', async () => {
    const { kiosk, token } = await ownerCtx();
    const otherKiosk = await seedKiosk();
    const otherLocation = await seedLocation(otherKiosk.id);
    const announcement = await seedAnnouncement(kiosk.id);

    await request(app.getHttpServer())
      .patch(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationIds: [otherLocation.id] })
      .expect(400);
  });

  it('rejects switching an announcement to MAX_N_TIMES without a valid maxDisplayCount', async () => {
    const { kiosk, token } = await ownerCtx();
    const announcement = await seedAnnouncement(kiosk.id, {
      repeatPolicy: AnnouncementRepeatPolicy.ONCE,
    });

    await request(app.getHttpServer())
      .patch(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ repeatPolicy: 'MAX_N_TIMES' })
      .expect(400);

    const res = await request(app.getHttpServer())
      .patch(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ repeatPolicy: 'MAX_N_TIMES', maxDisplayCount: 2 })
      .expect(200);
    expect(res.body.repeatPolicy).toBe('MAX_N_TIMES');
    expect(res.body.maxDisplayCount).toBe(2);
  });

  it('preserves an existing valid maxDisplayCount on a PATCH that omits it, while already MAX_N_TIMES', async () => {
    const { kiosk, token } = await ownerCtx();
    const announcement = await seedAnnouncement(kiosk.id, {
      repeatPolicy: AnnouncementRepeatPolicy.MAX_N_TIMES,
      maxDisplayCount: 5,
    });

    const res = await request(app.getHttpServer())
      .patch(`/announcements/${announcement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Still max n times' })
      .expect(200);

    expect(res.body.maxDisplayCount).toBe(5);
  });

  it('rejects a maxDisplayCount of 0 or a non-integer even when repeatPolicy is ONCE', async () => {
    const { token } = await ownerCtx();
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 3_600_000).toISOString();

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad', body: 'Bad', startAt, endAt, maxDisplayCount: 0 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad', body: 'Bad', startAt, endAt, maxDisplayCount: 1.5 })
      .expect(400);
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
    await request(app.getHttpServer())
      .post('/announcements')
      .send({})
      .expect(401);
  });

  // Announcements became portal-only when Promotions replaced the admin side of this feature —
  // ADMIN is no longer in @Roles on any announcement route. Platform-wide broadcasts are
  // consequently no longer creatable through the API; existing broadcast rows (seeded directly
  // here, as only a pre-migration row could be) still have to stay viewable on the portal and on
  // devices, which is what the remaining tests in this block cover.
  describe('broadcasts', () => {
    it('403s an admin on every announcement route — announcements are a portal feature now', async () => {
      const { token } = await adminCtx();
      const broadcast = await seedAnnouncement(null);
      const startAt = new Date().toISOString();
      const endAt = new Date(Date.now() + 3_600_000).toISOString();

      await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Broadcast',
          body: 'Everyone sees this',
          startAt,
          endAt,
          broadcast: true,
        })
        .expect(403);

      await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Hijacked' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejects broadcast:true from a kiosk-owner', async () => {
      const { token } = await ownerCtx();
      const startAt = new Date().toISOString();
      const endAt = new Date(Date.now() + 3_600_000).toISOString();

      await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Broadcast',
          body: 'Nope',
          startAt,
          endAt,
          broadcast: true,
        })
        .expect(403);
    });

    it('lets a kiosk-owner view (but not edit or delete) a platform-wide broadcast', async () => {
      const { token } = await ownerCtx();
      const broadcast = await seedAnnouncement(null, { title: 'For everyone' });

      const res = await request(app.getHttpServer())
        .get(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.title).toBe('For everyone');

      await request(app.getHttpServer())
        .patch(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Hijacked' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('location-manager visibility', () => {
    async function locationManagerCtx(managedLocationIds: string[] = []) {
      const kiosk = await seedKiosk();
      const location = await seedLocation(kiosk.id);
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds:
          managedLocationIds.length > 0 ? managedLocationIds : [location.id],
      });
      const token = await loginAs(app, 'lm@test.com');
      return { kiosk, location, token };
    }

    it('lets a location-manager view a kiosk-wide announcement (empty locationIds)', async () => {
      const { kiosk, token } = await locationManagerCtx();
      const announcement = await seedAnnouncement(kiosk.id);

      await request(app.getHttpServer())
        .get(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('lets a location-manager view an announcement scoped to one of their managed locations', async () => {
      const kiosk = await seedKiosk();
      const managedLocation = await seedLocation(kiosk.id);
      const otherLocation = await seedLocation(kiosk.id);
      await seedUser({
        email: 'lm@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [managedLocation.id, otherLocation.id],
      });
      const token = await loginAs(app, 'lm@test.com');
      const announcement = await seedAnnouncement(kiosk.id, {
        locationIds: [managedLocation.id],
      });

      await request(app.getHttpServer())
        .get(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('lets a location-manager view a platform-wide broadcast', async () => {
      const { token } = await locationManagerCtx();
      const broadcast = await seedAnnouncement(null);

      await request(app.getHttpServer())
        .get(`/announcements/${broadcast.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('403s a location-manager viewing an announcement outside their assigned locations', async () => {
      const kiosk = await seedKiosk();
      const otherLocation = await seedLocation(kiosk.id);
      const { token } = await locationManagerCtx([]);
      const announcement = await seedAnnouncement(kiosk.id, {
        locationIds: [otherLocation.id],
      });

      await request(app.getHttpServer())
        .get(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('403s a location-manager viewing another kiosk entirely', async () => {
      const { token } = await locationManagerCtx();
      const otherKiosk = await seedKiosk();
      const announcement = await seedAnnouncement(otherKiosk.id);

      await request(app.getHttpServer())
        .get(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    // A manager may now change what they wrote themselves, but this one has no author, so it is
    // still not theirs. See location-manager-permissions.e2e-spec.ts for the full authorship
    // matrix (their own, the owner's, and an unauthored one).
    it('403s a location-manager PATCHing or DELETEing an announcement they did not write', async () => {
      const { kiosk, token } = await locationManagerCtx();
      const announcement = await seedAnnouncement(kiosk.id);

      await request(app.getHttpServer())
        .patch(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Nope' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/announcements/${announcement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('upload-image', () => {
    it('401s with no auth token', async () => {
      await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .attach('file', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(401);
    });

    // Granted alongside POST /announcements: a manager who can author an announcement for their
    // own locations has to be able to put a picture in it, or the upload fails silently partway
    // through designing one.
    it('allows a location-manager, who can now author announcements for their own locations', async () => {
      const kiosk = await seedKiosk();
      await seedUser({
        email: 'lm2@test.com',
        role: 'LOCATION_MANAGER',
        kioskId: kiosk.id,
        managedLocationIds: [],
      });
      const lmToken = await loginAs(app, 'lm2@test.com');

      await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .set('Authorization', `Bearer ${lmToken}`)
        .attach('file', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(201);
    });

    it('400s when no file is attached', async () => {
      const { token } = await ownerCtx();

      await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('400s a disallowed file type', async () => {
      const { token } = await ownerCtx();

      await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'a.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('413s a file over the 5MB limit', async () => {
      const { token } = await ownerCtx();

      await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);
    });

    it('accepts a valid image, writes it to disk, and returns its url', async () => {
      const { token } = await ownerCtx();

      const res = await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(typeof res.body.url).toBe('string');
      expect(res.body.url).toMatch(/\/uploads\/announcements\/.+\.png$/);

      // A real HTTP round-trip against static serving isn't exercised here — @nestjs/serve-static
      // resolves its httpAdapter via DI at module-compile time, before Test.createTestingModule()'s
      // createNestApplication() has attached one, so it silently no-ops under this test harness even
      // though it works against the real app (verified manually with curl). Assert the file landed on
      // disk instead, which is what this endpoint is actually responsible for.
      const filename = res.body.url.split('/').pop() as string;
      const onDisk = path.join(
        process.cwd(),
        'uploads',
        'announcements',
        filename,
      );
      expect(fs.existsSync(onDisk)).toBe(true);
    });
  });
});
