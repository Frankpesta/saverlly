import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { seedUser, TEST_PASSWORD } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

describe('Auth change-password (e2e)', () => {
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

  it('rejects an incorrect current password', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword123!',
      })
      .expect(401);
  });

  it('rejects requests with no token', async () => {
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword123!' })
      .expect(401);
  });

  it('changes the password, returns a fresh token pair with mustChangePassword: false, and the old password stops working', async () => {
    const user = await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    await testPrisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);
    expect(decodeJwtPayload(loginRes.body.accessToken).mustChangePassword).toBe(
      true,
    );

    const changeRes = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword123!' })
      .expect(200);

    expect(changeRes.body.accessToken).toEqual(expect.any(String));
    expect(
      decodeJwtPayload(changeRes.body.accessToken).mustChangePassword,
    ).toBe(false);

    // Old password no longer works.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(401);

    // New password works, and mustChangePassword stays false on the DB row.
    const reloginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'NewPassword123!' })
      .expect(200);
    expect(
      decodeJwtPayload(reloginRes.body.accessToken).mustChangePassword,
    ).toBe(false);
  });

  it('blocks a mustChangePassword:true user from every other role-protected endpoint, while still allowing change-password and logout', async () => {
    const user = await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    await testPrisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);
    const accessToken = loginRes.body.accessToken as string;

    // Blocked — this is real API enforcement, not just the dashboard's own redirect.
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    // Still allowed while the flag is true — otherwise the user could never actually clear
    // it or sign out.
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // logout() only clears the refresh token, so the still-valid access token can still be
    // used to actually clear the flag.
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword123!' })
      .expect(200);
  });

  it('rejects a new password shorter than 8 characters', async () => {
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })
      .expect(400);
  });
});
