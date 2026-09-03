import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateScrapeSourceDto } from './dto/create-scrape-source.dto';
import { UpdateScrapeSourceDto } from './dto/update-scrape-source.dto';
import { ScrapeSourcesService } from './scrape-sources.service';

@ApiTags('Scrape Sources')
@ApiBearerAuth('jwt')
@Controller('scrape-sources')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ScrapeSourcesController {
  constructor(private readonly scrapeSourcesService: ScrapeSourcesService) {}

  @Post()
  @ApiOperation({ summary: 'Add a scrape source (URL + selector config), scheduled on creation' })
  @ApiResponse({ status: 201, description: 'Scrape source created and scheduled' })
  create(@Body() dto: CreateScrapeSourceDto) {
    return this.scrapeSourcesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all scrape sources' })
  @ApiResponse({ status: 200, description: 'Scrape sources' })
  findAll() {
    return this.scrapeSourcesService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a scrape source. Reschedules automatically if interval or active state changes' })
  @ApiResponse({ status: 200, description: 'Scrape source updated' })
  @ApiResponse({ status: 404, description: 'Scrape source not found' })
  update(@Param('id') id: string, @Body() dto: UpdateScrapeSourceDto) {
    return this.scrapeSourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a scrape source. Unschedules its repeat job' })
  @ApiResponse({ status: 204, description: 'Scrape source deleted' })
  @ApiResponse({ status: 404, description: 'Scrape source not found' })
  remove(@Param('id') id: string) {
    return this.scrapeSourcesService.remove(id);
  }

  @Post(':id/run-now')
  @ApiOperation({ summary: 'Manually trigger a scrape run outside the regular schedule' })
  @ApiResponse({ status: 201, description: 'Job queued' })
  runNow(@Param('id') id: string) {
    return this.scrapeSourcesService.runNow(id);
  }
}
