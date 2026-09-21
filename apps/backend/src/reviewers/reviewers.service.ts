import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from '../common/crypto/token-hash.util';
import { generateSubId } from '../common/crypto/sub-id.util';
import { serializable } from '../common/prisma/serializable.util';
import { CreateReviewerDto, RedeemReviewerDto } from './reviewer.dto';
import { CreateCouponTestEventDto } from '../public-api/dto/create-coupon-test-event.dto';

@Injectable()
export class ReviewersService {
  constructor(private readonly prisma: PrismaService) {}
  async list() {
    const [control, invites] = await Promise.all([
      this.prisma.reviewerAccessControl.findUnique({ where: { id: 'global' } }),
      this.prisma.reviewerInvite.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          sessions: { select: { id: true, createdAt: true, lastSeenAt: true } },
        },
      }),
    ]);
    return {
      enabled: control?.enabled === true,
      reviewers: invites.map(({ codeHash, ...invite }) => invite),
    };
  }
  async setEnabled(enabled: boolean) {
    return this.prisma.reviewerAccessControl.upsert({
      where: { id: 'global' },
      create: { id: 'global', enabled },
      update: { enabled },
    });
  }
  async create(dto: CreateReviewerDto) {
    const expiresAt = new Date(dto.expiresAt);
    if (
      expiresAt.getTime() <= Date.now() ||
      expiresAt.getTime() > Date.now() + 90 * 86400_000
    )
      throw new BadRequestException('Expiry must be in the next 90 days');
    const raw = randomBytes(12).toString('hex').toUpperCase();
    const code = 'REV-' + raw.match(/.{4}/g)!.join('-');
    const { codeHash, ...invite } = await this.prisma.reviewerInvite.create({
      data: {
        ...dto,
        expiresAt,
        codeHash: hashToken('REV' + raw),
        codeHint: raw.slice(-4),
      },
    });
    return { ...invite, code };
  }
  async revoke(id: string) {
    const result = await this.prisma.reviewerInvite.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (
      !result.count &&
      !(await this.prisma.reviewerInvite.findUnique({ where: { id } }))
    )
      throw new NotFoundException('Reviewer not found');
    return { revoked: true };
  }
  async redeem(dto: RedeemReviewerDto) {
    return serializable(this.prisma, async (tx) => {
      const control = await tx.reviewerAccessControl.findUnique({
        where: { id: 'global' },
      });
      const invite = await tx.reviewerInvite.findUnique({
        where: { codeHash: hashToken(dto.code) },
      });
      if (
        !control?.enabled ||
        !invite ||
        invite.revokedAt ||
        invite.expiresAt <= new Date()
      )
        throw new UnauthorizedException(
          'This access code is unavailable or has expired',
        );
      const tokenHash = hashToken(dto.token);
      const previous = await tx.reviewerSession.findUnique({
        where: { tokenHash },
      });
      if (previous && previous.inviteId !== invite.id)
        throw new UnauthorizedException('Use a new activation token');
      if (!previous) {
        const count = await tx.reviewerSession.count({
          where: { inviteId: invite.id },
        });
        if (count >= invite.maxInstallations)
          throw new BadRequestException(
            'This code has reached its installation limit',
          );
        await tx.reviewerSession.create({
          data: { inviteId: invite.id, tokenHash, lastSeenAt: new Date() },
        });
      }
      return { expiresAt: invite.expiresAt, name: invite.name };
    });
  }
  async authenticate(token: string) {
    const [control, session] = await Promise.all([
      this.prisma.reviewerAccessControl.findUnique({ where: { id: 'global' } }),
      this.prisma.reviewerSession.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { invite: true },
      }),
    ]);
    if (
      !control?.enabled ||
      !session ||
      session.invite.revokedAt ||
      session.invite.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Reviewer access has ended');
    if (
      !session.lastSeenAt ||
      Date.now() - session.lastSeenAt.getTime() > 60_000
    )
      await this.prisma.reviewerSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    return session;
  }
  async recordEvent(sessionId: string, dto: CreateCouponTestEventDto) {
    if (dto.result === 'applied' && dto.discountAmount === undefined)
      throw new BadRequestException('discountAmount is required');
    if (
      !(await this.prisma.merchant.findUnique({
        where: { id: dto.merchantId },
      }))
    )
      throw new BadRequestException('Merchant not found');
    if (
      dto.couponId &&
      !(await this.prisma.coupon.findFirst({
        where: { id: dto.couponId, merchantId: dto.merchantId },
      }))
    )
      throw new BadRequestException('Coupon does not belong to merchant');
    const eventId = dto.eventId ?? randomUUID();
    const payload = JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonObject;
    const event = await this.prisma.reviewerEvent.upsert({
      where: { sessionId_eventId: { sessionId, eventId } },
      update: {},
      create: {
        sessionId,
        eventId,
        payload,
        discountAmount: dto.result === 'applied' ? dto.discountAmount : 0,
      },
    });
    const stored = event.payload as Record<string, unknown>;
    if (
      Object.keys({ ...stored, ...payload }).some(
        (key) => stored[key] !== payload[key],
      )
    )
      throw new BadRequestException(
        'eventId already belongs to a different event',
      );
    return { id: event.id };
  }
  async savings(sessionId: string) {
    const result = await this.prisma.reviewerEvent.aggregate({
      where: { sessionId },
      _sum: { discountAmount: true },
    });
    return { lifetimeSaved: result._sum.discountAmount?.toNumber() ?? 0 };
  }
  async attribution(sessionId: string, merchantId: string) {
    if (
      !(await this.prisma.merchant.findFirst({
        where: { id: merchantId, active: true },
      }))
    )
      throw new BadRequestException('Merchant not found');
    const row = await this.prisma.reviewerAttribution.create({
      data: { sessionId, merchantId, subId: generateSubId() },
    });
    return { subId: row.subId };
  }
}
