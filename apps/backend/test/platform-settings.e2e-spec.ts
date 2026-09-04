import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

/**
 * The support address the kiosk portal links to used to be NEXT_PUBLIC_SUPPORT_EMAIL, baked
 * into the frontend at build time, so changing it meant a redeploy. The client asked to change
 * it from the backend, which is what these endpoints are for.
 */
describe('Platform settings (e2e)', () => {
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

  it('serves public settings without any auth, since the portal reads them before sign-in', async () => {
    const res = await request(app.getHttpServer()).get('/settings/public').expect(200);

    expect(res.body).toHaveProperty('supportEmail');
  });

  it('lets an ADMIN set the support email, and serves it back publicly', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: 'help@saverlly.com' })
      .expect(200)
      .expect((res) => expect(res.body.supportEmail).toBe('help@saverlly.com'));

    const publicRes = await request(app.getHttpServer()).get('/settings/public').expect(200);
    expect(publicRes.body.supportEmail).toBe('help@saverlly.com');

    const row = await testPrisma.platformSetting.findUniqueOrThrow({
      where: { key: 'supportEmail' },
    });
    expect(row.value).toBe('help@saverlly.com');
  });

  it('normalizes the email, matching every other email write path', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: '  Help@Saverlly.COM  ' })
      .expect(200)
      .expect((res) => expect(res.body.supportEmail).toBe('help@saverlly.com'));
  });

  it('accepts an empty string, which clears the setting so the portal renders it unlinked', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: 'help@saverlly.com' })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: '' })
      .expect(200)
      .expect((res) => expect(res.body.supportEmail).toBe(''));
  });

  it('rejects a value that is not an email', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: 'not-an-email' })
      .expect(400);
  });

  it('refuses a kiosk owner, who may read the value but never set it', async () => {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
    const token = await loginAs(app, 'owner@test.com');

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: 'attacker@evil.com' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  // The global ValidationPipe runs with forbidNonWhitelisted, so an unknown key is rejected at
  // the DTO rather than quietly dropped. Asserted so a later pipe change can't turn this
  // key/value table into somewhere arbitrary keys can be written.
  it('rejects keys that are not real settings, rather than storing them', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const token = await loginAs(app, 'admin@test.com');

    await request(app.getHttpServer())
      .patch('/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ supportEmail: 'help@saverlly.com', somethingElse: 'x' })
      .expect(400);

    expect(await testPrisma.platformSetting.count()).toBe(0);
  });
});
