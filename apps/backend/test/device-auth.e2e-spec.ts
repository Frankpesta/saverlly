import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KioskStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { DeviceAuthGuard } from '../src/common/guards/device-auth.guard';
import { hashToken } from '../src/common/crypto/token-hash.util';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase, testPrisma } from './utils/db';
import { seedDevice, seedKiosk, seedLocation } from './utils/fixtures';

function contextWithAuthHeader(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('DeviceAuthGuard (integration — real DB, real kill-switch behavior)', () => {
  let guard: DeviceAuthGuard;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [DeviceAuthGuard],
    }).compile();

    guard = moduleRef.get(DeviceAuthGuard);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedDeviceWithToken(deviceActive: boolean, kioskStatus: KioskStatus) {
    const kiosk = await seedKiosk();
    if (kioskStatus !== KioskStatus.ACTIVE) {
      await testPrisma.kiosk.update({ where: { id: kiosk.id }, data: { status: kioskStatus } });
    }
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    if (!deviceActive) {
      await testPrisma.device.update({ where: { id: device.id }, data: { active: false } });
    }
    const rawToken = randomBytes(32).toString('base64url');
    await testPrisma.deviceToken.create({
      data: { deviceId: device.id, tokenHash: hashToken(rawToken) },
    });
    return { device, rawToken };
  }

  it('allows a valid token for an active device on an active kiosk', async () => {
    const { rawToken } = await seedDeviceWithToken(true, KioskStatus.ACTIVE);
    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${rawToken}`))).resolves.toBe(
      true,
    );
  });

  it('rejects a missing Authorization header', async () => {
    await expect(guard.canActivate(contextWithAuthHeader())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown/bogus token', async () => {
    await expect(
      guard.canActivate(contextWithAuthHeader('Bearer totally-made-up-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token belonging to a disabled device (kill-switch)', async () => {
    const { rawToken } = await seedDeviceWithToken(false, KioskStatus.ACTIVE);
    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${rawToken}`))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token whose parent kiosk is inactive, even if the device itself is active', async () => {
    const { rawToken } = await seedDeviceWithToken(true, KioskStatus.INACTIVE);
    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${rawToken}`))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a revoked token', async () => {
    const { device, rawToken } = await seedDeviceWithToken(true, KioskStatus.ACTIVE);
    await testPrisma.deviceToken.updateMany({
      where: { deviceId: device.id },
      data: { revoked: true },
    });
    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${rawToken}`))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
