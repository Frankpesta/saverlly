import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import {
  RECIPE_PROBLEM_LABELS,
  RECIPE_RECHECK_DEVICES,
} from '@saverlly/shared-types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipeHealthReportDto } from './recipe-health.dto';

// Reports older than this never count towards flagging a store.
const REPORT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Keeping stores working: shoppers' checkouts report whether a store's recipe still finds its
 * checkout. A store is flagged for a re-check, and admins told, once enough separate devices
 * report a problem with no working report since. A working report or a newly saved recipe
 * clears the flag.
 */
@Injectable()
export class RecipeHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async record(deviceId: string, report: RecipeHealthReportDto): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: report.merchantId },
      select: {
        id: true,
        name: true,
        checkoutRecipe: true,
        recipeSavedAt: true,
        recipeNeedsRecheckAt: true,
      },
    });
    if (!merchant) throw new BadRequestException('merchantId does not exist');
    // A store with no recipe has nothing to go out of date.
    if (!merchant.checkoutRecipe) return;

    const now = new Date();
    await this.prisma.recipeHealthReport.create({
      data: {
        merchantId: merchant.id,
        deviceId,
        ok: report.ok,
        problem: report.ok ? null : report.problem,
      },
    });

    if (report.ok) {
      if (merchant.recipeNeedsRecheckAt)
        await this.prisma.merchant.update({
          where: { id: merchant.id },
          data: { recipeNeedsRecheckAt: null, recipeProblem: null },
        });
      return;
    }
    if (merchant.recipeNeedsRecheckAt) return;

    const lastOk = await this.prisma.recipeHealthReport.findFirst({
      where: { merchantId: merchant.id, ok: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const since = new Date(
      Math.max(
        now.getTime() - REPORT_WINDOW_MS,
        merchant.recipeSavedAt?.getTime() ?? 0,
        lastOk?.createdAt.getTime() ?? 0,
      ),
    );
    const devices = await this.prisma.recipeHealthReport.findMany({
      where: { merchantId: merchant.id, ok: false, createdAt: { gt: since } },
      distinct: ['deviceId'],
      select: { deviceId: true },
    });
    if (devices.length < RECIPE_RECHECK_DEVICES) return;

    // Only the report that sets the flag tells the admins, however many arrive together.
    const flagged = await this.prisma.merchant.updateMany({
      where: { id: merchant.id, recipeNeedsRecheckAt: null },
      data: { recipeNeedsRecheckAt: now, recipeProblem: report.problem },
    });
    if (flagged.count !== 1) return;

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, disabled: false },
      select: { id: true },
    });
    for (const admin of admins)
      await this.notifications.notify({
        userId: admin.id,
        type: NotificationType.STORE_NEEDS_RECHECK,
        title: `${merchant.name} needs a quick re-check`,
        body: `${RECIPE_PROBLEM_LABELS[report.problem!]} Open the store and get a setup code to fix it.`,
        metadata: { merchantId: merchant.id },
      });
  }
}
