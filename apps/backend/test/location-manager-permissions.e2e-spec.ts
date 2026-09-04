import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedLocation, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

/**
 * What a LOCATION_MANAGER may do for the locations they actually manage.
 *
 * Both grants were client decisions. Before them a manager saw the setup-code card, watched the
 * GET 403 into "Could not load the setup code", and could design a whole announcement only to be
 * refused on submit (with the image upload failing silently partway through). The scoping below
 * is the whole point of granting them: reachable for their own locations, refused for anyone
 * else's, and never kiosk-wide.
 */
describe('Location manager permissions (e2e)', () => {
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

  /** A kiosk with two locations, where the manager is assigned only the first. */
  async function seedScenario() {
    const kiosk = await seedKiosk();
    const mine = await seedLocation(kiosk.id, { name: 'Mine' });
    const theirs = await seedLocation(kiosk.id, { name: 'Theirs' });
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
    await seedUser({
      email: 'manager@test.com',
      role: 'LOCATION_MANAGER',
      kioskId: kiosk.id,
      managedLocationIds: [mine.id],
    });
    return { kiosk, mine, theirs, token: await loginAs(app, 'manager@test.com') };
  }

  function futureWindow() {
    return {
      startAt: new Date(Date.now() + 60_000).toISOString(),
      endAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
  }

  describe('setup codes', () => {
    it('generates, reads and revokes the code for a location they manage', async () => {
      const { mine, token } = await seedScenario();
      const auth = { Authorization: `Bearer ${token}` };

      const created = await request(app.getHttpServer())
        .post(`/locations/${mine.id}/setup-code`)
        .set(auth)
        .expect(201);
      expect(created.body.code).toEqual(expect.any(String));

      const read = await request(app.getHttpServer())
        .get(`/locations/${mine.id}/setup-code`)
        .set(auth)
        .expect(200);
      expect(read.body.setupCode.code).toBe(created.body.code);

      await request(app.getHttpServer())
        .patch(`/locations/${mine.id}/setup-code`)
        .set(auth)
        .send({ active: false })
        .expect(200)
        .expect((res) => expect(res.body.active).toBe(false));
    });

    // TenantScopeGuard is what draws this line, and it is the reason granting the role is safe.
    it('refuses a location in the same kiosk that they do not manage', async () => {
      const { theirs, token } = await seedScenario();
      const auth = { Authorization: `Bearer ${token}` };

      await request(app.getHttpServer())
        .post(`/locations/${theirs.id}/setup-code`)
        .set(auth)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/locations/${theirs.id}/setup-code`)
        .set(auth)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/locations/${theirs.id}/setup-code`)
        .set(auth)
        .send({ active: false })
        .expect(403);
    });

    it('refuses a location belonging to another kiosk entirely', async () => {
      const { token } = await seedScenario();
      const otherKiosk = await seedKiosk();
      const stranger = await seedLocation(otherKiosk.id);

      await request(app.getHttpServer())
        .post(`/locations/${stranger.id}/setup-code`)
        .set({ Authorization: `Bearer ${token}` })
        .expect(403);
    });
  });

  describe('creating announcements', () => {
    it('creates one scoped to a location they manage', async () => {
      const { kiosk, mine, token } = await seedScenario();

      const res = await request(app.getHttpServer())
        .post('/announcements')
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Local notice', locationIds: [mine.id], ...futureWindow() })
        .expect(201);

      expect(res.body.kioskId).toBe(kiosk.id);
      expect(res.body.locationIds).toEqual([mine.id]);
    });

    // An empty locationIds is the "every location in this kiosk" convention, which is the
    // owner's call. Enforced in the service: TenantScopeGuard works off a resource id in the
    // URL, and a create has none, so nothing upstream can see what the body is asking for.
    it('refuses an empty locationIds, which would mean the whole kiosk', async () => {
      const { token } = await seedScenario();

      for (const body of [{}, { locationIds: [] }]) {
        await request(app.getHttpServer())
          .post('/announcements')
          .set({ Authorization: `Bearer ${token}` })
          .send({ title: 'Kiosk-wide', ...body, ...futureWindow() })
          .expect(403);
      }
    });

    it('refuses a location in their own kiosk that they do not manage', async () => {
      const { mine, theirs, token } = await seedScenario();

      await request(app.getHttpServer())
        .post('/announcements')
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Not mine', locationIds: [theirs.id], ...futureWindow() })
        .expect(403);

      // Including one of their own alongside it must not launder the other through.
      await request(app.getHttpServer())
        .post('/announcements')
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Mixed', locationIds: [mine.id, theirs.id], ...futureWindow() })
        .expect(403);
    });

    it('still refuses a platform-wide broadcast, which is admin-only', async () => {
      const { mine, token } = await seedScenario();

      await request(app.getHttpServer())
        .post('/announcements')
        .set({ Authorization: `Bearer ${token}` })
        .send({
          title: 'Everyone',
          broadcast: true,
          locationIds: [mine.id],
          ...futureWindow(),
        })
        .expect(403);
    });

    // Granted alongside the create: without it the upload fails silently mid-design.
    it('uploads an announcement image', async () => {
      const { token } = await seedScenario();

      const res = await request(app.getHttpServer())
        .post('/announcements/upload-image')
        .set({ Authorization: `Bearer ${token}` })
        .attach('file', Buffer.from('fake-png-bytes'), {
          filename: 'promo.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(res.body.url).toMatch(/\/uploads\/announcements\/.+\.png$/);
    });

    it('records who wrote it', async () => {
      const { mine, token } = await seedScenario();

      const res = await request(app.getHttpServer())
        .post('/announcements')
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Mine', locationIds: [mine.id], ...futureWindow() })
        .expect(201);

      const manager = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'manager@test.com' },
      });
      expect(res.body.createdById).toBe(manager.id);
    });
  });

  /**
   * Authorship, not role, is the line for editing and deleting. A manager owns what they wrote
   * and nothing else, so the owner's announcement for the same location stays the owner's.
   */
  describe('editing and deleting announcements', () => {
    async function seedAnnouncement(
      kioskId: string,
      locationId: string,
      createdById: string | null,
    ) {
      return testPrisma.announcement.create({
        data: {
          kioskId,
          createdById,
          locationIds: [locationId],
          title: 'Existing',
          startAt: new Date(),
          endAt: new Date(Date.now() + 86_400_000),
        },
      });
    }

    it('lets a manager edit and delete one they created', async () => {
      const { kiosk, mine, token } = await seedScenario();
      const manager = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'manager@test.com' },
      });
      const own = await seedAnnouncement(kiosk.id, mine.id, manager.id);

      await request(app.getHttpServer())
        .patch(`/announcements/${own.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Edited by me' })
        .expect(200)
        .expect((res) => expect(res.body.title).toBe('Edited by me'));

      await request(app.getHttpServer())
        .delete(`/announcements/${own.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .expect(204);
    });

    it("refuses one the owner created for the same location", async () => {
      const { kiosk, mine, token } = await seedScenario();
      const owner = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'owner@test.com' },
      });
      const theirs = await seedAnnouncement(kiosk.id, mine.id, owner.id);

      await request(app.getHttpServer())
        .patch(`/announcements/${theirs.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Edited' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/announcements/${theirs.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .expect(403);
    });

    // Announcements written before authorship existed belong to nobody, so they stay owner-only
    // rather than becoming editable by whichever manager happens to see them.
    it('refuses one with no recorded author', async () => {
      const { kiosk, mine, token } = await seedScenario();
      const orphan = await seedAnnouncement(kiosk.id, mine.id, null);

      await request(app.getHttpServer())
        .patch(`/announcements/${orphan.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ title: 'Edited' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/announcements/${orphan.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .expect(403);
    });

    // The owner still runs their whole kiosk, whoever wrote a given announcement.
    it('leaves the owner able to edit and delete a manager’s announcement', async () => {
      const { kiosk, mine } = await seedScenario();
      const manager = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'manager@test.com' },
      });
      const theirs = await seedAnnouncement(kiosk.id, mine.id, manager.id);
      const ownerToken = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .patch(`/announcements/${theirs.id}`)
        .set({ Authorization: `Bearer ${ownerToken}` })
        .send({ title: 'Owner edited' })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/announcements/${theirs.id}`)
        .set({ Authorization: `Bearer ${ownerToken}` })
        .expect(204);
    });

    // Editing their own must not become a way around the create-time targeting rule.
    it('refuses a manager re-targeting their own announcement outside their scope', async () => {
      const { kiosk, mine, theirs: otherLocation, token } = await seedScenario();
      const manager = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'manager@test.com' },
      });
      const own = await seedAnnouncement(kiosk.id, mine.id, manager.id);

      await request(app.getHttpServer())
        .patch(`/announcements/${own.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ locationIds: [otherLocation.id] })
        .expect(403);
      // And not to "all locations" either.
      await request(app.getHttpServer())
        .patch(`/announcements/${own.id}`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ locationIds: [] })
        .expect(403);
    });

    // Deleting a team member must not take their live announcements off the kiosks with them.
    it('keeps a departed manager’s announcements, with the author cleared', async () => {
      const { kiosk, mine } = await seedScenario();
      const manager = await testPrisma.user.findUniqueOrThrow({
        where: { email: 'manager@test.com' },
      });
      const own = await seedAnnouncement(kiosk.id, mine.id, manager.id);
      const ownerToken = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer())
        .delete(`/kiosks/${kiosk.id}/users/${manager.id}`)
        .set({ Authorization: `Bearer ${ownerToken}` })
        .expect(204);

      const survivor = await testPrisma.announcement.findUniqueOrThrow({
        where: { id: own.id },
      });
      expect(survivor.createdById).toBeNull();
    });
  });

  it('still cannot create or delete locations themselves', async () => {
    const { kiosk, mine, token } = await seedScenario();
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer())
      .post('/locations')
      .set(auth)
      .send({ kioskId: kiosk.id, name: 'New', address: '1 St', city: 'C', state: 'ST', zip: '00000' })
      .expect(403);
    await request(app.getHttpServer()).delete(`/locations/${mine.id}`).set(auth).expect(403);
  });
});
