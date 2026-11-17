import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
// Loads .env.test (the test database and Redis DB) before the app reads its config. Without
// it this suite connected with the dev .env like no other e2e file, and failed whenever the
// dev database wasn't reachable with those credentials.
import { resetRedisTestDb, testPrisma } from './utils/db';
import { createTestApp } from './utils/test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    await resetRedisTestDb();
    app = (await createTestApp()) as INestApplication<App>;
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
