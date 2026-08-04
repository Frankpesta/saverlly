import { Injectable, NotFoundException } from '@nestjs/common';
import { KioskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKioskDto } from './dto/create-kiosk.dto';
import { UpdateKioskDto } from './dto/update-kiosk.dto';

@Injectable()
export class KiosksService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateKioskDto) {
    return this.prisma.kiosk.create({
      data: {
        name: dto.name,
        revenueSharePct: dto.revenueSharePct,
        contactEmail: dto.contactEmail,
        status: KioskStatus.ACTIVE,
      },
    });
  }

  findAll() {
    return this.prisma.kiosk.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }
    return kiosk;
  }

  async update(id: string, dto: UpdateKioskDto) {
    await this.findOne(id);
    return this.prisma.kiosk.update({ where: { id }, data: dto });
  }

  async updateStatus(id: string, status: KioskStatus) {
    await this.findOne(id);
    return this.prisma.kiosk.update({ where: { id }, data: { status } });
  }
}
