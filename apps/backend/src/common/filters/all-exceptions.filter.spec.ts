import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { AllExceptionsFilter } from './all-exceptions.filter';

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

function hostFor(response: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/test' }),
    }),
  } as unknown as ArgumentsHost;
}

function buildResponse() {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes an HttpException through unchanged (status + body) and does not report a 404 to Sentry', () => {
    const filter = new AllExceptionsFilter();
    const response = buildResponse();
    const exception = new NotFoundException('Kiosk not found');

    filter.catch(exception, hostFor(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(exception.getResponse());
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("preserves a ValidationPipe-style BadRequestException's structured body", () => {
    const filter = new AllExceptionsFilter();
    const response = buildResponse();
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['email must be an email'],
      error: 'Bad Request',
    });

    filter.catch(exception, hostFor(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['email must be an email'],
      error: 'Bad Request',
    });
  });

  it('maps an unmapped Prisma P2002 (unique constraint) to 409, not a raw 500', () => {
    const filter = new AllExceptionsFilter();
    const response = buildResponse();
    const exception = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });

    filter.catch(exception, hostFor(response));

    expect(response.status).toHaveBeenCalledWith(409);
    const body = response.json.mock.calls[0][0];
    expect(body.statusCode).toBe(409);
    expect(body.message).not.toMatch(/Unique constraint/);
    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });

  it('maps an unmapped Prisma P2025 (record not found) to 404', () => {
    const filter = new AllExceptionsFilter();
    const response = buildResponse();
    const exception = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });

    filter.catch(exception, hostFor(response));

    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('never leaks a plain unexpected error message to the client', () => {
    const filter = new AllExceptionsFilter();
    const response = buildResponse();
    const exception = new TypeError('Cannot read properties of undefined (reading "id")');

    filter.catch(exception, hostFor(response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });

  it('reports a genuine 5xx HttpException to Sentry (but not a 4xx)', () => {
    const filter = new AllExceptionsFilter();
    const response = buildResponse();
    const exception = new BadRequestException('Something 5xx-shaped', {
      cause: undefined,
    });
    jest.spyOn(exception, 'getStatus').mockReturnValue(500);

    filter.catch(exception, hostFor(response));

    expect(Sentry.captureException).toHaveBeenCalledWith(exception);
  });
});
