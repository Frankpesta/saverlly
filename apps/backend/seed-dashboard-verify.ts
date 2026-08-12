import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  await prisma.user.deleteMany({ where: { email: { contains: 'dashboard-verify' } } });
  await prisma.kiosk.deleteMany({ where: { name: { contains: 'Dashboard Verify' } } });

  await prisma.user.create({
    data: {
      email: 'admin@dashboard-verify.test',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const kiosk1 = await prisma.kiosk.create({
    data: {
      name: 'Dashboard Verify Kiosk One',
      status: 'ACTIVE',
      revenueSharePct: 30,
      contactEmail: 'owner1@dashboard-verify.test',
    },
  });

  await prisma.kiosk.create({
    data: {
      name: 'Dashboard Verify Kiosk Two',
      status: 'INACTIVE',
      revenueSharePct: 25.5,
      contactEmail: 'owner2@dashboard-verify.test',
    },
  });

  await prisma.kiosk.create({
    data: {
      name: 'Dashboard Verify Kiosk Three',
      status: 'ACTIVE',
      revenueSharePct: 40,
      contactEmail: 'owner3@dashboard-verify.test',
    },
  });

  await prisma.user.create({
    data: {
      email: 'owner@dashboard-verify.test',
      passwordHash,
      role: 'KIOSK_OWNER',
      kioskId: kiosk1.id,
    },
  });

  console.log('Seeded dashboard-verify admin@dashboard-verify.test / owner@dashboard-verify.test, password: Password123!');
}

main().finally(() => prisma.$disconnect());
