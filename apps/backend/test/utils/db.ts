import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

// override: true is required, not optional — @prisma/client auto-loads the nearest .env
// (apps/backend/.env, the DEV file) as an import-time side effect the moment `PrismaClient`
// is imported above, which fires BEFORE this config() call ever runs. Without override:true,
// dotenv's default non-destructive merge leaves that DEV .env's DATABASE_URL (and everything
// else) in process.env instead of this file's real .env.test values — silently pointing every
// e2e test's PrismaService (and this file's own testPrisma) at the dev database instead of the
// dedicated test one. Confirmed via direct row-count inspection; see project memory.
const { parsed: testEnv } = config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  override: true,
});

// Standalone client for test setup/teardown — separate from the app's injected
// PrismaService so fixtures can run before the Nest app is even built.
export const testPrisma = new PrismaClient();

/**
 * Wipes the isolated test Redis DB — clears any BullMQ jobs/schedules left over between runs.
 * Opens a short-lived connection scoped to this call only, so it never lingers as an open
 * handle the way a module-level connection would (see BullmqConfigModule's own fix for why).
 */
export async function resetRedisTestDb(): Promise<void> {
  const redisUrl = new URL(testEnv?.REDIS_URL ?? process.env.REDIS_URL!);
  const dbIndex = redisUrl.pathname.replace(/^\//, '');
  if (!dbIndex || dbIndex === '0') {
    throw new Error('Refusing to FLUSHDB on Redis DB 0 — .env.test must use an isolated DB index');
  }

  const redis = new Redis({
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    db: Number(dbIndex),
    maxRetriesPerRequest: null,
  });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

export async function resetDatabase(): Promise<void> {
  // Delete order respects FK constraints (children before parents).
  await testPrisma.commissionEvent.deleteMany();
  await testPrisma.payout.deleteMany();
  await testPrisma.attributionAttempt.deleteMany();
  await testPrisma.couponTestEvent.deleteMany();
  await testPrisma.coupon.deleteMany();
  await testPrisma.scrapeSource.deleteMany();
  await testPrisma.merchant.deleteMany();
  await testPrisma.affiliateProgram.deleteMany();
  await testPrisma.announcement.deleteMany();
  await testPrisma.deviceToken.deleteMany();
  await testPrisma.device.deleteMany();
  await testPrisma.locationSetupCode.deleteMany();
  await testPrisma.location.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.kiosk.deleteMany();
}
