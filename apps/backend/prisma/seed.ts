/**
 * Local development seed. Creates one login for each role plus enough data to click through
 * every screen. Safe to re-run: every row is upserted on a stable key, so running it twice
 * changes nothing and never duplicates data.
 *
 *   npm run prisma:seed -w @saverlly/backend
 *
 * Every seeded password is SEED_PASSWORD (default below) and is NOT flagged for a forced
 * change, so you can sign in straight away. Never run this against production.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PASSWORD_BCRYPT_ROUNDS } from '../src/common/crypto/password-hash.constants';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'Saverlly!2026';

const ADMIN_EMAIL = 'admin@saverlly.local';
const OWNER_EMAIL = 'owner@saverlly.local';
const MANAGER_EMAIL = 'manager@saverlly.local';

// Fixed ids keep the seed idempotent for models without a natural unique key.
const KIOSK_ID = '00000000-0000-4000-8000-000000000001';
const LOCATION_IDS = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
];
const PROGRAM_ID = '00000000-0000-4000-8000-000000000201';

async function upsertUser(data: {
  email: string;
  name: string;
  role: UserRole;
  kioskId?: string;
  managedLocationIds?: string[];
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      name: data.name,
      role: data.role,
      kioskId: data.kioskId ?? null,
      managedLocationIds: data.managedLocationIds ?? [],
      passwordHash: data.passwordHash,
      mustChangePassword: false,
      disabled: false,
    },
    create: { ...data, mustChangePassword: false },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  const passwordHash = await bcrypt.hash(PASSWORD, PASSWORD_BCRYPT_ROUNDS);

  await upsertUser({ email: ADMIN_EMAIL, name: 'Saverlly Admin', role: UserRole.ADMIN, passwordHash });

  await prisma.kiosk.upsert({
    where: { id: KIOSK_ID },
    update: {},
    create: { id: KIOSK_ID, name: 'Downtown Kiosks', revenueSharePct: 30 },
  });

  const locations = [
    { id: LOCATION_IDS[0], name: 'Main Street', address: '120 Main St', city: 'Austin', state: 'TX', zip: '78701', tags: ['downtown', 'high-traffic'] },
    { id: LOCATION_IDS[1], name: 'Mall Food Court', address: '3200 Mall Rd', city: 'Dallas', state: 'TX', zip: '75201', tags: ['mall'] },
  ];
  for (const location of locations) {
    await prisma.location.upsert({
      where: { id: location.id },
      update: {},
      create: { ...location, kioskId: KIOSK_ID },
    });
  }
  // Fixed codes so a local agent can register with a known value.
  const setupCodes = ['DEVSTRT2', 'DEVMXPK3'];
  for (const [index, locationId] of LOCATION_IDS.entries()) {
    await prisma.locationSetupCode.upsert({
      where: { locationId },
      update: {},
      create: { locationId, code: setupCodes[index] },
    });
  }

  await upsertUser({ email: OWNER_EMAIL, name: 'Kiosk Owner', role: UserRole.KIOSK_OWNER, kioskId: KIOSK_ID, passwordHash });
  await upsertUser({
    email: MANAGER_EMAIL,
    name: 'Location Manager',
    role: UserRole.LOCATION_MANAGER,
    kioskId: KIOSK_ID,
    managedLocationIds: [LOCATION_IDS[0]],
    passwordHash,
  });

  await prisma.affiliateProgram.upsert({
    where: { id: PROGRAM_ID },
    update: {},
    create: { id: PROGRAM_ID, networkName: 'Impact', programId: 'demo-123', hasCouponApi: false },
  });

  const merchant = await prisma.merchant.upsert({
    where: { domain: 'allbirds.com' },
    update: {},
    create: {
      name: 'Allbirds',
      domain: 'allbirds.com',
      affiliateProgramId: PROGRAM_ID,
      attributionMethod: 'URL_PARAM',
      affiliateUrlParamKey: 'irclickid',
      affiliateUrlParamValue: 'saverlly-dev',
      checkoutRecipe: {
        checkoutUrlPatterns: ['/checkouts/*'],
        couponFieldSelector: 'input[name="reductions"]',
        applyButtonSelector: 'button[aria-label="Apply Discount Code"]',
        successIndicatorSelector: '',
        failureIndicatorSelector: '[id^="error-for-ReductionsInput"]',
        cartTotalSelector: '[role="table"] [role="cell"]',
        couponApplyMode: 'replace',
        removeCouponSelector: 'button[data-event-name="remove_discount_code"]',
      },
    },
  });
  const coupons = [
    { code: 'WELCOME10', description: '10% off your first order', discountType: 'PERCENT' as const, discountValue: 10 },
    { code: 'SAVE20', description: '20% off select products', discountType: 'PERCENT' as const, discountValue: 20 },
    { code: 'FREESHIP', description: 'Free shipping', discountType: 'UNKNOWN' as const, discountValue: null },
  ];
  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { merchantId_code: { merchantId: merchant.id, code: coupon.code } },
      update: {},
      create: { ...coupon, merchantId: merchant.id, source: 'MANUAL' },
    });
  }

  console.log('\nSeed complete. Sign in with password:', PASSWORD);
  console.log(`  Admin console  http://localhost:3001/admin/login   ${ADMIN_EMAIL}`);
  console.log(`  Kiosk portal   http://localhost:3001/portal/login  ${OWNER_EMAIL}`);
  console.log(`  Kiosk portal   http://localhost:3001/portal/login  ${MANAGER_EMAIL} (Main Street only)`);
  console.log(`  Agent setup codes: ${setupCodes.join(', ')}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
