import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('Platform Settings')
@Controller('settings')
export class PlatformSettingsController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  // Deliberately no guard: the portal's support link and the login pages both need this before
  // anyone is authenticated. Guards are per-route in this app, so omitting them is the whole
  // mechanism. Only keys marked `public` in platform-settings.constants.ts are served here.
  @Get('public')
  @ApiOperation({
    summary: 'Read the platform settings that are safe to expose without auth',
    description:
      'The kiosk portal reads its support address from here at runtime. It used to come from a ' +
      'build-time NEXT_PUBLIC_ env var, which meant changing it required a frontend redeploy.',
  })
  @ApiResponse({ status: 200, description: 'Public settings' })
  findPublic() {
    return this.platformSettings.findPublic();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Read every platform setting' })
  @ApiResponse({ status: 200, description: 'All settings' })
  findAll() {
    return this.platformSettings.findAll();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Change one or more platform settings' })
  @ApiResponse({ status: 200, description: 'Updated settings' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  update(@Body() dto: UpdatePlatformSettingsDto) {
    return this.platformSettings.update(dto);
  }
}
