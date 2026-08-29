import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const kiosk = await prisma.kiosk.findFirst({ where: { name: 'Dashboard Verify Kiosk One' } });
  if (!kiosk) throw new Error('Seed the kiosks first (admin/kiosks screen verify script).');

  const existing = await prisma.location.findMany({ where: { kioskId: kiosk.id } });
  const existingIds = existing.map((l) => l.id);
  await prisma.device.deleteMany({ where: { locationId: { in: existingIds } } });
  await prisma.locationSetupCode.deleteMany({ where: { locationId: { in: existingIds } } });
  await prisma.location.deleteMany({ where: { kioskId: kiosk.id } });

  const location = await prisma.location.create({
    data: {
      kioskId: kiosk.id,
      name: 'Downtown Internet Cafe',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      tags: ['mall', 'high-traffic'],
    },
  });

  await prisma.locationSetupCode.create({
    data: { locationId: location.id, code: 'ABCD1234', active: true },
  });

  await prisma.device.create({
    data: {
      locationId: location.id,
      label: 'Computer 1',
      active: true,
      lastSeenAt: new Date(),
      osVersion: 'Windows 11 Pro',
    },
  });

  await prisma.device.create({
    data: {
      locationId: location.id,
      label: 'Computer 2',
      active: false,
    },
  });

  console.log('Seeded location + setup code + 2 devices for', kiosk.name);
}

main().finally(() => prisma.$disconnect());
