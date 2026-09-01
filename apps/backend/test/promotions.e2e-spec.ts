import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import {
  loginAs,
  seedDeviceWithToken,
  seedKiosk,
  seedLocation,
  seedPromotion,
  seedUser,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Promotions (e2e)', () => {
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

  async function adminCtx() {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    return loginAs(app, 'admin@test.com');
  }

  const validBody = {
    name: 'Summer Sale',
    imageSmallUrl: 'https://cdn.example.com/small.png',
    imageLargeUrl: 'https://cdn.example.com/large.png',
    clickUrl: 'https://example.com/summer',
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 3_600_000).toISOString(),
  };

  describe('admin CRUD', () => {
    it('creates a promotion, defaulting to active and untargeted', async () => {
      const token = await adminCtx();

      const res = await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)
        .expect(201);

      expect(res.body.name).toBe('Summer Sale');
      expect(res.body.active).toBe(true);
      expect(res.body.targetTags).toEqual([]);
      expect(res.body.locationIds).toEqual([]);
    });

    it('accepts the localhost URLs its own upload endpoint returns', async () => {
      // Regression: @IsUrl() defaults to require_tld:true, which rejects `localhost` — so every
      // create failed in local dev with "imageSmallUrl must be a URL address" even though the
      // upload had just succeeded. The other tests here all use cdn.example.com and so never
      // exercised the real upload→create round trip.
      const token = await adminCtx();

      await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          imageSmallUrl: 'http://localhost:3000/uploads/promotions/small.png',
          imageLargeUrl: 'http://localhost:3000/uploads/promotions/large.png',
        })
        .expect(201);
    });

    it('still rejects a value that is not a URL at all', async () => {
      const token = await adminCtx();

      await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, imageSmallUrl: 'not a url' })
        .expect(400);
    });

    it('rejects endAt <= startAt', async () => {
      const token = await adminCtx();
      const startAt = new Date().toISOString();

      await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, startAt, endAt: startAt })
        .expect(400);
    });

    it('rejects a locationId that does not exist', async () => {
      const token = await adminCtx();

      await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          locationIds: ['00000000-0000-0000-0000-000000000000'],
        })
        .expect(400);
    });

    it('normalizes target tags — trimmed, lowercased and de-duplicated', async () => {
      const token = await adminCtx();

      const res = await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, targetTags: ['  Mall ', 'MALL', 'Downtown', ''] })
        .expect(201);

      expect(res.body.targetTags).toEqual(['mall', 'downtown']);
    });

    it('leaves existing tags alone on a PATCH that omits targetTags', async () => {
      const token = await adminCtx();
      const promotion = await seedPromotion({ targetTags: ['mall'] });

      const res = await request(app.getHttpServer())
        .patch(`/promotions/${promotion.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' })
        .expect(200);

      expect(res.body.name).toBe('Renamed');
      expect(res.body.targetTags).toEqual(['mall']);
    });

    it('deletes a promotion', async () => {
      const token = await adminCtx();
      const promotion = await seedPromotion();

      await request(app.getHttpServer())
        .delete(`/promotions/${promotion.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/promotions/${promotion.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('401s with no auth token and 403s a kiosk-owner', async () => {
      const kiosk = await seedKiosk();
      await seedUser({
        email: 'owner@test.com',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const ownerToken = await loginAs(app, 'owner@test.com');

      await request(app.getHttpServer()).get('/promotions').expect(401);

      await request(app.getHttpServer())
        .get('/promotions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(validBody)
        .expect(403);
    });
  });

  describe('upload-image', () => {
    // A 1x1 PNG — real bytes, so image-size can actually parse a header off it.
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    it('400s when the size query param is missing or unknown', async () => {
      const token = await adminCtx();

      await request(app.getHttpServer())
        .post('/promotions/upload-image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', onePixelPng, 'promo.png')
        .expect(400);

      await request(app.getHttpServer())
        .post('/promotions/upload-image?size=medium')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', onePixelPng, 'promo.png')
        .expect(400);
    });

    it('400s an image whose dimensions do not match the requested slot', async () => {
      const token = await adminCtx();

      const res = await request(app.getHttpServer())
        .post('/promotions/upload-image?size=small')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', onePixelPng, 'promo.png')
        .expect(400);

      // The message has to name the real numbers — that's the whole point of validating here
      // rather than letting a mis-sized creative reach the popup.
      expect(res.body.message).toContain('320x100');
    });

    it('400s when no file is attached', async () => {
      const token = await adminCtx();

      await request(app.getHttpServer())
        .post('/promotions/upload-image?size=small')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('GET /public/promotions/active', () => {
    async function deviceCtx(locationTags: string[] = []) {
      const kiosk = await seedKiosk();
      const location = await seedLocation(kiosk.id, { tags: locationTags });
      const { rawToken } = await seedDeviceWithToken(location.id);
      return { rawToken, location };
    }

    async function fetchActive(rawToken: string) {
      const res = await request(app.getHttpServer())
        .get('/public/promotions/active')
        .set('Authorization', `Bearer ${rawToken}`)
        .expect(200);
      return res.body as { id: string }[];
    }

    it('returns an untargeted promotion to every device', async () => {
      const { rawToken } = await deviceCtx();
      const promotion = await seedPromotion();

      const body = await fetchActive(rawToken);
      expect(body.map((p) => p.id)).toEqual([promotion.id]);
    });

    it('matches a tag regardless of the casing the location was tagged with', async () => {
      // Location.tags is stored verbatim from the dashboard's TagInput while
      // Promotion.targetTags is normalized on write — the match has to survive that gap.
      const { rawToken } = await deviceCtx(['Mall']);
      const promotion = await seedPromotion({ targetTags: ['mall'] });

      const body = await fetchActive(rawToken);
      expect(body.map((p) => p.id)).toEqual([promotion.id]);
    });

    it('excludes a promotion whose tags do not match the device location', async () => {
      const { rawToken } = await deviceCtx(['airport']);
      await seedPromotion({ targetTags: ['mall'] });

      expect(await fetchActive(rawToken)).toEqual([]);
    });

    it('treats tag and location targeting as a union, not an intersection', async () => {
      // Tags don't match, but the location is picked explicitly — that alone must be enough.
      const { rawToken, location } = await deviceCtx(['airport']);
      const promotion = await seedPromotion({
        targetTags: ['mall'],
        locationIds: [location.id],
      });

      const body = await fetchActive(rawToken);
      expect(body.map((p) => p.id)).toEqual([promotion.id]);
    });

    it('excludes inactive promotions and ones outside their schedule window', async () => {
      const { rawToken } = await deviceCtx();
      await seedPromotion({ active: false });
      await seedPromotion({
        startAt: new Date(Date.now() + 3_600_000),
        endAt: new Date(Date.now() + 7_200_000),
      });
      await seedPromotion({
        startAt: new Date(Date.now() - 7_200_000),
        endAt: new Date(Date.now() - 3_600_000),
      });

      expect(await fetchActive(rawToken)).toEqual([]);
    });

    it('401s without a device token', async () => {
      await request(app.getHttpServer())
        .get('/public/promotions/active')
        .expect(401);
    });
  });
});
