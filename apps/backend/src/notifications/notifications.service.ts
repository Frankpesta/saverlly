import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { EmailJob } from '../email/types/email-job.type';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
  email: EmailJob;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SEND_EMAIL)
    private readonly emailQueue: Queue<EmailJob>,
  ) {}

  /** Writes the in-app Notification row and enqueues the matching email — the single call site every trigger uses. */
  async notify(params: NotifyParams): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        metadata: params.metadata,
      },
    });

    // The in-app notification is already committed above — a transient queue/Redis failure
    // here must not throw back through every caller (several of which run this post-commit,
    // after their own DB write already succeeded). The in-app notification still exists even
    // if the email doesn't go out.
    try {
      await this.emailQueue.add(params.email.type, params.email);
    } catch (error) {
      this.logger.error(
        `Notification for user ${params.userId} (${params.type}) was recorded, but queuing its email failed`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  findForUser(userId: string, opts: { unreadOnly?: boolean } = {}) {
    return this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<{ success: true }> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return { success: true };
  }

  async markAllRead(userId: string): Promise<{ success: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
