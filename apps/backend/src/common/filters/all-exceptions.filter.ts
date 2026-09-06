import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

/**
 * Global safety net, not a replacement for the deliberate per-service error mapping already
 * in place (e.g. merchants.service.ts's mapDomainConflict) -- those already throw a proper
 * HttpException with a tailored message and pass straight through here unchanged (branch 1
 * below). This filter only changes behavior for the two things nothing else was catching:
 *
 * 1. A Prisma error nobody thought to map for this particular endpoint (P2002/P2025/P2003)
 *    previously fell through to a generic, wrong-status 500 -- now gets the correct
 *    status/generic message instead of leaking the raw Prisma error shape.
 * 2. Any other unexpected error (a plain TypeError, etc) is logged with its full stack
 *    server-side and returns Nest's own generic "Internal server error" body -- the same
 *    body Nest's default filter already returns, just now behind one consistent log line
 *    instead of whatever ad hoc handling (or lack of it) each call site had.
 *
 * Every branch that logs a genuinely unexpected error (5xx HttpException, an unmapped Prisma
 * error, or a plain unhandled exception) also reports it via Sentry.captureException -- a
 * no-op until SENTRY_DSN is configured (see common/sentry.ts).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Only 5xx is actually unexpected here -- everything else (401/403/404/409/429) is
      // the app behaving as designed, and logging every one of those would just be noise.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `${request.method} ${request.url} -> ${status}`,
          exception.stack,
        );
        Sentry.captureException(exception);
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, message } = mapPrismaError(exception);
      this.logger.error(
        `${request.method} ${request.url} -> ${status} (Prisma ${exception.code})`,
        exception.stack,
      );
      // Every Prisma error reaching this global filter is, by definition, one no service-layer
      // code mapped explicitly -- worth tracking even when it maps to a clean 409/404 here,
      // since it likely means a new endpoint needs its own tailored mapping.
      Sentry.captureException(exception);
      response.status(status).json({ statusCode: status, message });
      return;
    }

    const error = exception instanceof Error ? exception : undefined;
    this.logger.error(`${request.method} ${request.url} -> 500`, error?.stack);
    Sentry.captureException(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}

function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): { status: number; message: string } {
  switch (err.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'A record with these values already exists',
      };
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, message: 'Record not found' };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message: 'This action conflicts with related records',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      };
  }
}
