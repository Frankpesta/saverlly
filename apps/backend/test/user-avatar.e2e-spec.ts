import * as fs from 'fs';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');

/**
 * Profile photos did not exist at any layer before this: User had no avatarUrl, and nav-user
 * rendered an AvatarImage whose src was never populated.
 */
describe('User avatars (e2e)', () => {
  let app: INestApplication;
  const written: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
    // Uploads land in the real uploads dir, so anything this spec wrote has to go.
    for (const file of written) {
      fs.rmSync(path.join(AVATAR_DIR, file), { force: true });
    }
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  function trackUploads(url: string) {
    written.push(path.basename(url));
  }

  async function ownerToken() {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
    return loginAs(app, 'owner@test.com');
  }

  it('uploads a photo and returns the updated user, with no password hash', async () => {
    const token = await ownerToken();

    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'me.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(res.body.avatarUrl).toMatch(/\/uploads\/avatars\/.+\.png$/);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('refreshTokenHash');
    trackUploads(res.body.avatarUrl);

    const row = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'owner@test.com' },
    });
    expect(row.avatarUrl).toBe(res.body.avatarUrl);
  });

  it('includes avatarUrl on GET /users/me', async () => {
    const token = await ownerToken();

    const upload = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'me.png',
        contentType: 'image/png',
      })
      .expect(201);
    trackUploads(upload.body.avatarUrl);

    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.avatarUrl).toBe(upload.body.avatarUrl);
  });

  it('deletes the previous file when a photo is replaced', async () => {
    const token = await ownerToken();

    const first = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('one'), { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const firstPath = path.join(AVATAR_DIR, path.basename(first.body.avatarUrl));
    expect(fs.existsSync(firstPath)).toBe(true);

    const second = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('two'), { filename: 'b.png', contentType: 'image/png' })
      .expect(201);
    trackUploads(second.body.avatarUrl);

    // fs.rm is fired without awaiting in the service, so give the unlink a tick to land.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(fs.existsSync(firstPath)).toBe(false);
  });

  it('clears the photo on delete', async () => {
    const token = await ownerToken();

    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('one'), { filename: 'a.png', contentType: 'image/png' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.avatarUrl).toBeNull();
  });

  it('rejects a non-image, and an upload with no file at all', async () => {
    const token = await ownerToken();

    // The multer fileFilter drops the file, so the handler sees no file and 400s.
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-'), {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('file', Buffer.from('one'), { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
    await request(app.getHttpServer()).delete('/users/me/avatar').expect(401);
  });
});
