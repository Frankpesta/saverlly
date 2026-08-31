import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { seedKiosk, seedLocation } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Device registration (e2e)', () => {
  let app: INestApplication;

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  // Fresh app per test (not the usual shared beforeAll app) — POST /devices/register is
  // throttled to 5/60s per caller, and its own ThrottlerStorageService is scoped to this
  // DI container, so a new app instance gives each test a clean rate-limit budget instead
  // of tests later in the file spuriously 429ing once the file's cumulative calls exceed 5.
  beforeEach(async () => {
    await resetDatabase();
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedSetupCode(overrides: { kioskStatus?: 'ACTIVE' | 'INACTIVE'; codeActive?: boolean } = {}) {
    const kiosk = await seedKiosk();
    if (overrides.kioskStatus === 'INACTIVE') {
      await testPrisma.kiosk.update({ where: { id: kiosk.id }, data: { status: 'INACTIVE' } });
    }
    const location = await seedLocation(kiosk.id);
    const setupCode = await testPrisma.locationSetupCode.create({
      data: { locationId: location.id, code: 'REGTEST1', active: overrides.codeActive ?? true },
    });
    return { kiosk, location, setupCode };
  }

  it('registers a device immediately with no approval step, returning a usable token', async () => {
    const { location } = await seedSetupCode();

    const res = await request(app.getHttpServer())
      .post('/devices/register')
      .send({
        setupCode: 'REGTEST1',
        hostname: 'KIOSK-PC-01',
        deviceIdentifier: 'agent-local-uuid-123',
        osVersion: 'Windows 11 Pro 10.0.26200',
      })
      .expect(201);

    expect(res.body).toHaveProperty('deviceId');
    expect(res.body).toHaveProperty('token');
    expect(res.body.label).toBe('KIOSK-PC-01');

    const device = await testPrisma.device.findUniqueOrThrow({ where: { id: res.body.deviceId } });
    expect(device.locationId).toBe(location.id);
    expect(device.active).toBe(true);
    expect(device.localDeviceIdentifier).toBe('agent-local-uuid-123');
    expect(device.osVersion).toBe('Windows 11 Pro 10.0.26200');

    // The returned token must actually authenticate against the device-facing API.
    await request(app.getHttpServer())
      .get('/public/devices/me/status')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
  });

  it('lets the same reusable setup code register multiple different computers', async () => {
    await seedSetupCode();

    const first = await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: 'REGTEST1', hostname: 'PC-1' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: 'REGTEST1', hostname: 'PC-2' })
      .expect(201);

    expect(first.body.deviceId).not.toBe(second.body.deviceId);
    expect(first.body.token).not.toBe(second.body.token);
  });

  it('registers with a setup code typed in a different case or with stray whitespace', async () => {
    await seedSetupCode();

    const res = await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: '  regtest1  ', hostname: 'PC-1' })
      .expect(201);

    expect(res.body).toHaveProperty('token');
  });

  it('400s an invalid setup code', async () => {
    await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: 'NOT-A-REAL-CODE' })
      .expect(400);
  });

  it('400s a revoked (inactive) setup code', async () => {
    await seedSetupCode({ codeActive: false });

    await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: 'REGTEST1' })
      .expect(400);
  });

  it('400s when the parent kiosk is INACTIVE', async () => {
    await seedSetupCode({ kioskStatus: 'INACTIVE' });

    await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: 'REGTEST1' })
      .expect(400);
  });

  it('falls back to "New Computer" when neither label nor hostname is given', async () => {
    await seedSetupCode();

    const res = await request(app.getHttpServer())
      .post('/devices/register')
      .send({ setupCode: 'REGTEST1' })
      .expect(201);

    expect(res.body.label).toBe('New Computer');
  });
});
