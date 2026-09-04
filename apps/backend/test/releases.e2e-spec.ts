import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedKiosk, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

/**
 * The dashboard's Download Agent button used to point at an unset build-time env var and fall
 * back to a toast, so it never downloaded anything. These endpoints are what it points at now.
 *
 * The installer is a real 32MB build artifact that isn't in the repo, so the tests write a small
 * stand-in and point AGENT_RELEASE_DIR at it rather than depending on `npm run package` having
 * been run.
 */
describe('Agent releases (e2e)', () => {
  let app: INestApplication;
  let releaseDir: string;
  const originalReleaseDir = process.env.AGENT_RELEASE_DIR;
  const originalDownloadUrl = process.env.AGENT_DOWNLOAD_URL;

  beforeAll(async () => {
    releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saverlly-release-'));
    fs.writeFileSync(
      path.join(releaseDir, 'SaverllyAgentSetup.exe'),
      // "MZ" is the DOS/PE magic number every Windows executable starts with, so this is at
      // least shaped like the thing it stands in for.
      Buffer.from('MZ-not-a-real-installer'),
    );
    process.env.AGENT_RELEASE_DIR = releaseDir;
    delete process.env.AGENT_DOWNLOAD_URL;

    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
    fs.rmSync(releaseDir, { recursive: true, force: true });
    if (originalReleaseDir === undefined) delete process.env.AGENT_RELEASE_DIR;
    else process.env.AGENT_RELEASE_DIR = originalReleaseDir;
    if (originalDownloadUrl === undefined) delete process.env.AGENT_DOWNLOAD_URL;
    else process.env.AGENT_DOWNLOAD_URL = originalDownloadUrl;
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function ownerToken() {
    const kiosk = await seedKiosk();
    await seedUser({ email: 'owner@test.com', role: 'KIOSK_OWNER', kioskId: kiosk.id });
    return loginAs(app, 'owner@test.com');
  }

  it('describes the installer so the dashboard can state its version and size', async () => {
    const token = await ownerToken();

    const res = await request(app.getHttpServer())
      .get('/releases/agent/latest/meta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.available).toBe(true);
    expect(res.body.filename).toBe('SaverllyAgentSetup.exe');
    expect(res.body.sizeBytes).toBe(23);
    expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.remoteUrl).toBeNull();
  });

  it('serves the installer as a named download', async () => {
    const token = await ownerToken();

    const res = await request(app.getHttpServer())
      .get('/releases/agent/latest')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-disposition']).toContain('SaverllyAgentSetup.exe');
    // Content-Length rather than the body: supertest parses a binary content type into an
    // object, so asserting on res.body here would compare against "[object Object]".
    expect(res.headers['content-length']).toBe('23');
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/releases/agent/latest/meta').expect(401);
    await request(app.getHttpServer()).get('/releases/agent/latest').expect(401);
  });

  it('is available to a location manager, who is often the one installing devices', async () => {
    const kiosk = await seedKiosk();
    await seedUser({
      email: 'manager@test.com',
      role: 'LOCATION_MANAGER',
      kioskId: kiosk.id,
      managedLocationIds: [],
    });
    const token = await loginAs(app, 'manager@test.com');

    await request(app.getHttpServer())
      .get('/releases/agent/latest/meta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('reports unavailable rather than erroring when nothing is published', async () => {
    const token = await ownerToken();
    const missingDir = path.join(releaseDir, 'nope');
    process.env.AGENT_RELEASE_DIR = missingDir;

    const res = await request(app.getHttpServer())
      .get('/releases/agent/latest/meta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.available).toBe(false);

    await request(app.getHttpServer())
      .get('/releases/agent/latest')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    process.env.AGENT_RELEASE_DIR = releaseDir;
  });

  it('redirects to object storage when the release is hosted remotely', async () => {
    const token = await ownerToken();
    process.env.AGENT_DOWNLOAD_URL = 'https://cdn.example.com/SaverllyAgentSetup.exe';

    const meta = await request(app.getHttpServer())
      .get('/releases/agent/latest/meta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(meta.body.remoteUrl).toBe('https://cdn.example.com/SaverllyAgentSetup.exe');

    await request(app.getHttpServer())
      .get('/releases/agent/latest')
      .set('Authorization', `Bearer ${token}`)
      .expect(302)
      .expect('Location', 'https://cdn.example.com/SaverllyAgentSetup.exe');

    delete process.env.AGENT_DOWNLOAD_URL;
  });
});
