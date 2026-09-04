import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import {
  PLATFORM_SETTING_DEFINITIONS,
  PLATFORM_SETTING_KEYS,
  PUBLIC_PLATFORM_SETTING_KEYS,
  type PlatformSettingKey,
} from './platform-settings.constants';

export type PlatformSettings = Record<PlatformSettingKey, string>;

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Every setting, resolved: saved value, else the env fallback, else the coded default. */
  async findAll(): Promise<PlatformSettings> {
    const rows = await this.prisma.platformSetting.findMany({
      where: { key: { in: PLATFORM_SETTING_KEYS } },
    });
    const saved = new Map(rows.map((row) => [row.key, row.value]));

    return Object.fromEntries(
      PLATFORM_SETTING_KEYS.map((key) => {
        const definition = PLATFORM_SETTING_DEFINITIONS[key];
        const value =
          saved.get(key) ??
          this.configService.get<string>(definition.fallbackEnv) ??
          definition.default;
        return [key, value];
      }),
    ) as PlatformSettings;
  }

  /** The subset safe to serve without auth. Read by the portal and by the login pages. */
  async findPublic(): Promise<Partial<PlatformSettings>> {
    const all = await this.findAll();
    return Object.fromEntries(
      PUBLIC_PLATFORM_SETTING_KEYS.map((key) => [key, all[key]]),
    );
  }

  async update(dto: UpdatePlatformSettingsDto): Promise<PlatformSettings> {
    const entries = Object.entries(dto).filter(
      ([key, value]) =>
        value !== undefined && PLATFORM_SETTING_KEYS.includes(key as PlatformSettingKey),
    ) as Array<[PlatformSettingKey, string]>;

    if (entries.length > 0) {
      await this.prisma.$transaction(
        entries.map(([key, value]) =>
          this.prisma.platformSetting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          }),
        ),
      );
    }

    return this.findAll();
  }
}
