import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { seedUser, TEST_PASSWORD } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Auth (e2e)', () => {
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

  it('logs in with valid credentials and returns an access + refresh token', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('rejects an incorrect password', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong-password' })
      .expect(401);
  });

  it('rejects login for a disabled user', async () => {
    await seedUser({ email: 'disabled@test.com', role: 'ADMIN', disabled: true });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'disabled@test.com', password: TEST_PASSWORD })
      .expect(401);
  });

  it('logs in successfully when the email casing differs from how it was stored', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'Admin@Test.COM', password: TEST_PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('stores a new user email as lowercase regardless of the casing submitted', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ email: 'Mixed.Case@Example.COM' })
      .expect(200);

    expect(res.body.email).toBe('mixed.case@example.com');
  });

  it('rejects malformed login payloads', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400);
  });

  it('returns the current user profile from /users/me without exposing password hashes', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(res.body.email).toBe('admin@test.com');
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.refreshTokenHash).toBeUndefined();
  });

  it('rejects requests with no token', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('rejects an already-issued access token immediately once the user is disabled — not just at next login', async () => {
    const user = await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    await testPrisma.user.update({ where: { id: user.id }, data: { disabled: true } });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(401);
  });

  it('rejects an already-issued access token immediately once the user no longer exists', async () => {
    const user = await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    await testPrisma.user.delete({ where: { id: user.id } });

    // Exactly what a deleted kiosk's cascade-deleted owner/manager rows produce: the still
    // technically-unexpired access token must stop working on the very next request, not
    // linger until its natural expiry.
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(401);
  });

  it('issues a new token pair on refresh and rotates the stored hash', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    expect(refreshRes.body.refreshToken).not.toBe(loginRes.body.refreshToken);

    // The real security property: the old refresh token must no longer work post-rotation.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(401);
  });

  it('invalidates the refresh token on logout, so it can no longer be used', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(401);
  });
});
