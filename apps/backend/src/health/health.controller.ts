import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'connected' };
  }
}
