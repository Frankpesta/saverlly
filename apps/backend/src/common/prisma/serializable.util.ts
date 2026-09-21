import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Retry serialization conflicts; callbacks must contain only database operations. */
export async function serializable<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034' ||
        attempt >= 4
      )
        throw error;
    }
  }
}
