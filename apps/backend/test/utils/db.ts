import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

// Standalone client for test setup/teardown — separate from the app's injected
// PrismaService so fixtures can run before the Nest app is even built.
export const testPrisma = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  // Delete order respects FK constraints (children before parents).
  await testPrisma.couponTestEvent.deleteMany();
  await testPrisma.coupon.deleteMany();
  await testPrisma.scrapeSource.deleteMany();
  await testPrisma.merchant.deleteMany();
  await testPrisma.affiliateProgram.deleteMany();
  await testPrisma.deviceToken.deleteMany();
  await testPrisma.device.deleteMany();
  await testPrisma.locationSetupCode.deleteMany();
  await testPrisma.location.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.kiosk.deleteMany();
}
