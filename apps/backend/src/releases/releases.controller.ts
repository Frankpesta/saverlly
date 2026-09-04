import {
  Controller,
  Get,
  NotFoundException,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReleasesService } from './releases.service';

@ApiTags('Releases')
@ApiBearerAuth('jwt')
@Controller('releases/agent')
@UseGuards(JwtAuthGuard)
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) {}

  @Get('latest/meta')
  @ApiOperation({
    summary: 'Describe the current Windows agent installer',
    description:
      'Version, size, SHA-256 and build time, so the dashboard can say what it is about to ' +
      'download and an operator can verify the file. `available: false` means no installer is ' +
      'configured on this deployment.',
  })
  @ApiResponse({ status: 200, description: 'Release metadata' })
  meta() {
    return this.releasesService.getMeta();
  }

  @Get('latest')
  @ApiOperation({ summary: 'Download the current Windows agent installer' })
  @ApiResponse({ status: 200, description: 'The installer binary' })
  @ApiResponse({ status: 302, description: 'Redirect to object storage, when configured' })
  @ApiResponse({ status: 404, description: 'No installer is configured on this deployment' })
  download(@Res() res: Response) {
    const meta = this.releasesService.getMeta();

    if (meta.remoteUrl) {
      return res.redirect(302, meta.remoteUrl);
    }
    if (!meta.available) {
      throw new NotFoundException(
        'No agent installer is available on this deployment yet',
      );
    }

    // res.download sets Content-Disposition and streams, so a 32MB installer never has to be
    // buffered in memory.
    return res.download(this.releasesService.installerPath, meta.filename);
  }
}
