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
const { parsed: fileEnv } = config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  override: true,
});

// Allow a dedicated per-run database/Redis namespace without editing checked-in env
// files or flushing another developer's tests. Refuse destructive setup on the dev DB.
const testEnv = {
  ...fileEnv,
  ...(process.env.TEST_DATABASE_URL
    ? { DATABASE_URL: process.env.TEST_DATABASE_URL }
    : {}),
  ...(process.env.TEST_REDIS_URL
    ? { REDIS_URL: process.env.TEST_REDIS_URL }
    : {}),
};
if (
  process.env.NODE_ENV !== 'test' ||
  !testEnv.DATABASE_URL ||
  !new URL(testEnv.DATABASE_URL).pathname.endsWith('_test')
) {
  throw new Error(
    'Integration tests require NODE_ENV=test and a database name ending in _test',
  );
}
process.env.DATABASE_URL = testEnv.DATABASE_URL;
process.env.REDIS_URL = testEnv.REDIS_URL;

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
    throw new Error(
      'Refusing to FLUSHDB on Redis DB 0 — .env.test must use an isolated DB index',
    );
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

async function deleteAllInOrder(): Promise<void> {
  // Delete order respects FK constraints (children before parents).
  await testPrisma.reviewerInvite.deleteMany();
  await testPrisma.reviewerAccessControl.deleteMany();
  await testPrisma.notification.deleteMany();
  // Like Notification, references User with ON DELETE RESTRICT, so it has to go before the
  // user.deleteMany() at the bottom of this function.
  await testPrisma.dismissedAlert.deleteMany();
  await testPrisma.commissionAdjustment.deleteMany();
  await testPrisma.commissionEvent.deleteMany();
  await testPrisma.payout.deleteMany();
  await testPrisma.attributionAttempt.deleteMany();
  await testPrisma.couponTestEvent.deleteMany();
  await testPrisma.coupon.deleteMany();
  await testPrisma.scrapeSource.deleteMany();
  await testPrisma.merchant.deleteMany();
  await testPrisma.affiliateProgram.deleteMany();
  await testPrisma.announcement.deleteMany();
  // Promotion has no FK relations (targeting is by id/tag arrays, not joins), so its position
  // here is arbitrary — but it still has to be cleared or promos leak between tests.
  await testPrisma.promotion.deleteMany();
  await testPrisma.deviceToken.deleteMany();
  await testPrisma.device.deleteMany();
  await testPrisma.locationSetupCode.deleteMany();
  await testPrisma.locationEmployee.deleteMany();
  await testPrisma.location.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.kiosk.deleteMany();
  // No FK relations, but it persists across tests and would otherwise leak a support email set
  // by one spec into another's reading of GET /settings/public.
  await testPrisma.platformSetting.deleteMany();
}

/**
 * Every e2e test app boots the real BullMQ schedulers (sync-commissions, generate-payouts,
 * commission-digest), each of which fires an immediate first run on `onModuleInit` — off on
 * Redis's own timeline, not awaited by Jest. If one of those async runs (e.g.
 * generatePayouts inserting a real Payout row) lands between two steps of the delete
 * sequence above, a later step can hit a FK violation against a row that appeared out of
 * band. Retrying the whole pass absorbs that race without needing to make the schedulers
 * test-aware — a stray insert from one pass is just gone by the next.
 */
export async function resetDatabase(): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await deleteAllInOrder();
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      // Brief backoff so the interleaving scheduler write that caused the FK violation has
      // a chance to actually finish before the retry, instead of racing it again immediately.
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}
