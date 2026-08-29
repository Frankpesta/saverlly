import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AffiliateProgram, Prisma } from '@prisma/client';
import { decrypt, encrypt } from '../common/crypto/encryption.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAffiliateProgramDto } from './dto/create-affiliate-program.dto';
import { UpdateAffiliateProgramDto } from './dto/update-affiliate-program.dto';

@Injectable()
export class AffiliateProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAffiliateProgramDto) {
    const program = await this.prisma.affiliateProgram.create({
      data: {
        networkName: dto.networkName,
        programId: dto.programId,
        apiCredentials: dto.apiCredentials ? encrypt(JSON.stringify(dto.apiCredentials)) : null,
        hasCouponApi: dto.hasCouponApi,
      },
    });
    return this.toSafeResponse(program);
  }

  async findAll() {
    const programs = await this.prisma.affiliateProgram.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return programs.map((p) => this.toSafeResponse(p));
  }

  async findOneOrThrow(id: string) {
    const program = await this.prisma.affiliateProgram.findUnique({ where: { id } });
    if (!program) {
      throw new NotFoundException('Affiliate program not found');
    }
    return program;
  }

  async update(id: string, dto: UpdateAffiliateProgramDto) {
    await this.findOneOrThrow(id);
    const program = await this.prisma.affiliateProgram.update({
      where: { id },
      data: {
        networkName: dto.networkName,
        programId: dto.programId,
        ...(dto.apiCredentials !== undefined
          ? { apiCredentials: encrypt(JSON.stringify(dto.apiCredentials)) }
          : {}),
        hasCouponApi: dto.hasCouponApi,
      },
    });
    return this.toSafeResponse(program);
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    try {
      await this.prisma.affiliateProgram.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException('This affiliate program is still linked to one or more merchants');
      }
      throw err;
    }
  }

  /** Internal use only (affiliate adapters) — never exposed via a controller. */
  async getDecryptedCredentials(id: string): Promise<Record<string, string> | null> {
    const program = await this.findOneOrThrow(id);
    if (!program.apiCredentials) {
      return null;
    }
    return JSON.parse(decrypt(program.apiCredentials));
  }

  private toSafeResponse(program: AffiliateProgram) {
    const { apiCredentials, ...safe } = program;
    return { ...safe, hasCredentials: apiCredentials !== null };
  }
}
