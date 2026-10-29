import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  StoreSetupSession,
  StoreSetupStatus,
  UserRole,
} from '@prisma/client';
import {
  formatStoreSetupCode,
  type CheckoutRecipe,
  type CurrentStoreSetupSessionResponse,
  type IssuedStoreSetupCode,
  type RedeemStoreSetupCodeResponse,
  type StoreSetupExtensionSession,
  type StoreSetupSessionView,
  type StoreSetupTestResult,
} from '@saverlly/shared-types';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { generateSetupCode } from '../common/crypto/setup-code.util';
import { hashToken } from '../common/crypto/token-hash.util';
import { serializable } from '../common/prisma/serializable.util';
import { CheckoutRecipeDto } from '../merchants/dto/checkout-recipe.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  RedeemStoreSetupCodeDto,
  SubmitStoreSetupRecipeDto,
} from './dto/store-setup.dto';

export const STORE_SETUP_CODE_TTL_MS = 10 * 60_000;
export const STORE_SETUP_SESSION_TTL_MS = 4 * 60 * 60_000;
const LAST_SEEN_DEBOUNCE_MS = 60_000;
const CODE_ISSUE_ATTEMPTS = 3;

const LIVE_STATUSES: StoreSetupStatus[] = [
  StoreSetupStatus.PENDING,
  StoreSetupStatus.CONNECTED,
  StoreSetupStatus.SUBMITTED,
];
const REDEEMED_STATUSES: StoreSetupStatus[] = [
  StoreSetupStatus.CONNECTED,
  StoreSetupStatus.SUBMITTED,
];

// One generic message for every redemption failure, so a probe can't tell an unknown code from
// a used, cancelled or expired one.
const INVALID_CODE_MESSAGE = 'This setup code is invalid or has expired';
const SESSION_ENDED_MESSAGE = 'This store setup session has ended';
const DRAFT_CHANGED_MESSAGE =
  'A newer setup draft arrived. Review it and try again';

const authenticatedInclude = {
  merchant: {
    select: { id: true, name: true, domain: true, checkoutRecipe: true },
  },
  createdBy: { select: { role: true, disabled: true } },
} satisfies Prisma.StoreSetupSessionInclude;

export type AuthenticatedStoreSetupSession =
  Prisma.StoreSetupSessionGetPayload<{
    include: typeof authenticatedInclude;
  }>;

@Injectable()
export class StoreSetupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a fresh one-time code. Any other live session for the merchant is cancelled, so
   * there is only ever one code or connected extension per store. */
  async issueCode(
    merchantId: string,
    adminId: string,
  ): Promise<IssuedStoreSetupCode> {
    await this.assertMerchantExists(merchantId);

    for (let attempt = 1; ; attempt++) {
      const code = `SET${generateSetupCode()}`;
      try {
        const session = await serializable(this.prisma, async (tx) => {
          const now = new Date();
          await tx.storeSetupSession.updateMany({
            where: { merchantId, status: { in: LIVE_STATUSES } },
            data: { status: StoreSetupStatus.CANCELLED, cancelledAt: now },
          });
          return tx.storeSetupSession.create({
            data: {
              merchantId,
              createdById: adminId,
              codeHash: hashToken(code),
              codeExpiresAt: new Date(now.getTime() + STORE_SETUP_CODE_TTL_MS),
            },
          });
        });
        return { code: formatStoreSetupCode(code), session: toView(session) };
      } catch (error) {
        // A codeHash collision is astronomically unlikely, but a fresh code is the correct fix.
        if (isUniqueViolation(error) && attempt < CODE_ISSUE_ATTEMPTS) continue;
        if (isForeignKeyViolation(error))
          throw new NotFoundException('Merchant not found');
        throw error;
      }
    }
  }

  async getCurrent(
    merchantId: string,
  ): Promise<CurrentStoreSetupSessionResponse> {
    await this.assertMerchantExists(merchantId);
    const session = await this.prisma.storeSetupSession.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return { session: session ? toView(session) : null };
  }

  /** Discards a code, a connected extension or a submitted draft. Idempotent for an already
   * cancelled session; a saved one can't be cancelled after the fact. */
  async cancel(
    merchantId: string,
    sessionId: string,
  ): Promise<StoreSetupSessionView> {
    return serializable(this.prisma, async (tx) => {
      const session = await this.findForMerchant(tx, merchantId, sessionId);
      if (session.status === StoreSetupStatus.APPLIED)
        throw new ConflictException(
          'This recipe has already been saved to the store',
        );
      if (session.status === StoreSetupStatus.CANCELLED) return toView(session);
      return toView(
        await tx.storeSetupSession.update({
          where: { id: session.id },
          data: { status: StoreSetupStatus.CANCELLED, cancelledAt: new Date() },
        }),
      );
    });
  }

  /** The dashboard Save: the only path by which a setup draft reaches a live merchant. */
  async apply(
    merchantId: string,
    sessionId: string,
    adminId: string,
    reviewedSubmittedAt: string,
  ) {
    const session = await this.findForMerchant(
      this.prisma,
      merchantId,
      sessionId,
    );
    if (session.status === StoreSetupStatus.APPLIED)
      throw new ConflictException(
        'This recipe has already been saved to the store',
      );
    if (session.status !== StoreSetupStatus.SUBMITTED || !session.submittedAt)
      throw new ConflictException('There is no submitted recipe to save');
    // The admin reviewed one draft; a resubmission since then must be reviewed before saving.
    if (session.submittedAt.getTime() !== Date.parse(reviewedSubmittedAt))
      throw new ConflictException(DRAFT_CHANGED_MESSAGE);

    // Re-validate rather than trust what was accepted at submit time: the validator rules may
    // have tightened since, and this is the last gate before shoppers' checkouts use it.
    const recipe = await validatedRecipe(session.draftRecipe);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Pinned to the reviewed submittedAt, so a resubmission racing this Save can't swap an
      // unreviewed draft onto the store.
      const claimed = await tx.storeSetupSession.updateMany({
        where: {
          id: session.id,
          merchantId,
          status: StoreSetupStatus.SUBMITTED,
          submittedAt: session.submittedAt,
        },
        data: {
          status: StoreSetupStatus.APPLIED,
          appliedAt: now,
          appliedById: adminId,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException(DRAFT_CHANGED_MESSAGE);
      const merchant = await tx.merchant.update({
        where: { id: merchantId },
        // A new recipe starts with a clean bill of health.
        data: {
          checkoutRecipe: recipe,
          recipeSavedAt: now,
          recipeNeedsRecheckAt: null,
          recipeProblem: null,
        },
      });
      const applied = await tx.storeSetupSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      return { session: toView(applied), merchant };
    });
  }

  async redeem(
    dto: RedeemStoreSetupCodeDto,
  ): Promise<RedeemStoreSetupCodeResponse> {
    const tokenHash = hashToken(dto.token);
    return serializable(this.prisma, async (tx) => {
      const now = new Date();
      const session = await tx.storeSetupSession.findUnique({
        where: { codeHash: hashToken(dto.code) },
        include: authenticatedInclude,
      });
      if (!session || !issuedByActiveAdmin(session))
        throw new UnauthorizedException(INVALID_CODE_MESSAGE);

      // A retry from the same install (its first response was lost) gets the same answer.
      if (
        session.tokenHash === tokenHash &&
        REDEEMED_STATUSES.includes(session.status) &&
        session.sessionExpiresAt &&
        session.sessionExpiresAt > now
      )
        return toRedeemResponse(session, session.sessionExpiresAt);

      if (
        session.status !== StoreSetupStatus.PENDING ||
        session.codeExpiresAt <= now
      )
        throw new UnauthorizedException(INVALID_CODE_MESSAGE);

      const tokenInUse = await tx.storeSetupSession.findUnique({
        where: { tokenHash },
        select: { id: true },
      });
      if (tokenInUse)
        throw new UnauthorizedException(
          'Start setup again to create a new activation token',
        );

      const sessionExpiresAt = new Date(
        now.getTime() + STORE_SETUP_SESSION_TTL_MS,
      );
      await tx.storeSetupSession.update({
        where: { id: session.id },
        data: {
          status: StoreSetupStatus.CONNECTED,
          tokenHash,
          connectedAt: now,
          lastSeenAt: now,
          sessionExpiresAt,
        },
      });
      return toRedeemResponse(session, sessionExpiresAt);
    });
  }

  /** Backs SetupSessionGuard. Re-checked on every request, so cancelling on the dashboard,
   * issuing a newer code, or disabling the issuing admin ends the session immediately. */
  async authenticate(token: string): Promise<AuthenticatedStoreSetupSession> {
    if (!token) throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    const session = await this.prisma.storeSetupSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: authenticatedInclude,
    });
    if (
      !session ||
      !isExtensionActive(session) ||
      !issuedByActiveAdmin(session)
    )
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);

    if (
      !session.lastSeenAt ||
      Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_DEBOUNCE_MS
    ) {
      session.lastSeenAt = new Date();
      await this.prisma.storeSetupSession.update({
        where: { id: session.id },
        data: { lastSeenAt: session.lastSeenAt },
      });
    }
    return session;
  }

  toExtensionSession(
    session: AuthenticatedStoreSetupSession,
  ): StoreSetupExtensionSession {
    return {
      sessionId: session.id,
      state:
        session.status === StoreSetupStatus.SUBMITTED
          ? 'SUBMITTED'
          : 'CONNECTED',
      // authenticate() only returns sessions with a future sessionExpiresAt.
      expiresAt: session.sessionExpiresAt!.toISOString(),
      submittedAt: session.submittedAt?.toISOString() ?? null,
      merchant: {
        id: session.merchant.id,
        name: session.merchant.name,
        domain: session.merchant.domain,
        checkoutRecipe: session.merchant
          .checkoutRecipe as unknown as CheckoutRecipe | null,
      },
    };
  }

  /** Stores (or replaces) the draft. The live merchant recipe is never touched here. */
  async submitRecipe(
    session: AuthenticatedStoreSetupSession,
    dto: SubmitStoreSetupRecipeDto,
  ): Promise<StoreSetupExtensionSession> {
    const now = new Date();
    const updated = await this.prisma.storeSetupSession.updateMany({
      where: {
        id: session.id,
        tokenHash: session.tokenHash,
        status: { in: REDEEMED_STATUSES },
        sessionExpiresAt: { gt: now },
      },
      data: {
        status: StoreSetupStatus.SUBMITTED,
        draftRecipe: toJson(dto.recipe),
        testResult: toJson(dto.testResult),
        submittedAt: now,
      },
    });
    // Cancelled or superseded between the guard's check and this write.
    if (updated.count !== 1)
      throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
    return this.toExtensionSession({
      ...session,
      status: StoreSetupStatus.SUBMITTED,
      submittedAt: now,
    });
  }

  /** The extension's "End setup". A submitted draft stays reviewable on the dashboard; a
   * session that never submitted anything has nothing to review and is cancelled. */
  async endSession(session: AuthenticatedStoreSetupSession): Promise<void> {
    const now = new Date();
    const owned = { id: session.id, tokenHash: session.tokenHash };
    await this.prisma.$transaction([
      this.prisma.storeSetupSession.updateMany({
        where: { ...owned, status: StoreSetupStatus.CONNECTED },
        data: {
          status: StoreSetupStatus.CANCELLED,
          cancelledAt: now,
          sessionExpiresAt: now,
        },
      }),
      this.prisma.storeSetupSession.updateMany({
        where: {
          ...owned,
          status: StoreSetupStatus.SUBMITTED,
          sessionExpiresAt: { gt: now },
        },
        data: { sessionExpiresAt: now },
      }),
    ]);
  }

  private async assertMerchantExists(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
  }

  private async findForMerchant(
    db: Prisma.TransactionClient | PrismaService,
    merchantId: string,
    sessionId: string,
  ) {
    const session = await db.storeSetupSession.findFirst({
      where: { id: sessionId, merchantId },
    });
    if (!session) throw new NotFoundException('Setup session not found');
    return session;
  }
}

function isExtensionActive(session: StoreSetupSession, now = new Date()) {
  return (
    REDEEMED_STATUSES.includes(session.status) &&
    session.sessionExpiresAt !== null &&
    session.sessionExpiresAt > now
  );
}

function issuedByActiveAdmin(session: AuthenticatedStoreSetupSession) {
  return (
    session.createdBy !== null &&
    session.createdBy.role === UserRole.ADMIN &&
    !session.createdBy.disabled
  );
}

function toView(
  session: StoreSetupSession,
  now = new Date(),
): StoreSetupSessionView {
  return {
    id: session.id,
    merchantId: session.merchantId,
    state: deriveState(session, now),
    extensionActive: isExtensionActive(session, now),
    codeExpiresAt: session.codeExpiresAt.toISOString(),
    sessionExpiresAt: session.sessionExpiresAt?.toISOString() ?? null,
    connectedAt: session.connectedAt?.toISOString() ?? null,
    lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
    submittedAt: session.submittedAt?.toISOString() ?? null,
    appliedAt: session.appliedAt?.toISOString() ?? null,
    cancelledAt: session.cancelledAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    createdById: session.createdById,
    appliedById: session.appliedById,
    draftRecipe: session.draftRecipe as unknown as CheckoutRecipe | null,
    testResult: session.testResult as unknown as StoreSetupTestResult | null,
  };
}

function deriveState(
  session: StoreSetupSession,
  now: Date,
): StoreSetupSessionView['state'] {
  switch (session.status) {
    case StoreSetupStatus.PENDING:
      return session.codeExpiresAt <= now ? 'EXPIRED' : 'PENDING';
    case StoreSetupStatus.CONNECTED:
      return isExtensionActive(session, now) ? 'CONNECTED' : 'EXPIRED';
    default:
      return session.status;
  }
}

function toRedeemResponse(
  session: AuthenticatedStoreSetupSession,
  expiresAt: Date,
): RedeemStoreSetupCodeResponse {
  return {
    sessionId: session.id,
    expiresAt: expiresAt.toISOString(),
    merchant: {
      id: session.merchant.id,
      name: session.merchant.name,
      domain: session.merchant.domain,
    },
  };
}

async function validatedRecipe(draft: Prisma.JsonValue | null) {
  const recipe = plainToInstance(CheckoutRecipeDto, draft ?? {});
  const errors =
    draft !== null && typeof draft === 'object' && !Array.isArray(draft)
      ? await validate(recipe, { whitelist: true, forbidNonWhitelisted: true })
      : null;
  // Same body shape as the global ValidationPipe ({ message: string[] }), which the
  // dashboard's API client already joins for display.
  if (errors === null || errors.length > 0)
    throw new BadRequestException([
      'The submitted recipe is no longer valid. Run setup again',
      ...(errors ?? []).flatMap((error) =>
        Object.values(error.constraints ?? {}),
      ),
    ]);
  return toJson(recipe);
}

/** Plain JSON: drops undefined optionals and class prototypes before Prisma stores it. */
function toJson(value: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isForeignKeyViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}
