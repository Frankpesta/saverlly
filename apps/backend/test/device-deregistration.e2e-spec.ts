import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { hashToken } from '../src/common/crypto/token-hash.util';
import { resetDatabase, testPrisma } from './utils/db';
import { seedDevice, seedKiosk, seedLocation } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Device deregistration (e2e) — DELETE /public/devices/me', () => {
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

  async function seedDeviceWithToken() {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const rawToken = randomBytes(32).toString('base64url');
    await testPrisma.deviceToken.create({
      data: { deviceId: device.id, tokenHash: hashToken(rawToken) },
    });
    return { device, rawToken };
  }

  it('deletes the Device row and its tokens, authenticated by its own device token', async () => {
    const { device, rawToken } = await seedDeviceWithToken();

    await request(app.getHttpServer())
      .delete('/public/devices/me')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(204);

    expect(await testPrisma.device.findUnique({ where: { id: device.id } })).toBeNull();
    expect(await testPrisma.deviceToken.findMany({ where: { deviceId: device.id } })).toHaveLength(0);
  });

  it('the deleted device token can no longer authenticate afterward', async () => {
    const { rawToken } = await seedDeviceWithToken();

    await request(app.getHttpServer())
      .delete('/public/devices/me')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/public/devices/me/status')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(401);
  });

  it('401s a missing/bogus device token without deleting anything', async () => {
    const { device } = await seedDeviceWithToken();

    await request(app.getHttpServer()).delete('/public/devices/me').expect(401);
    await request(app.getHttpServer())
      .delete('/public/devices/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);

    expect(await testPrisma.device.findUnique({ where: { id: device.id } })).not.toBeNull();
  });
});
