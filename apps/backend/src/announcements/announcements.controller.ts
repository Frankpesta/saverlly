import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { diskStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import {
  TenantResource,
  TenantResourceType,
} from '../common/decorators/tenant-resource.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UploadAnnouncementImageResponseDto } from './dto/upload-announcement-image-response.dto';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'announcements');
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Kiosk-desktop announcements, authored by a kiosk owner for their own kiosk. ADMIN is
 * deliberately absent from every route here: the admin side of announcements was replaced by
 * Promotions (extension-facing, see PromotionsController), so announcements are now a portal-only
 * feature. Platform-wide broadcasts (Announcement.kioskId = null) are consequently no longer
 * creatable. Existing broadcast rows still display on devices, but nothing can author a new one.
 */
@ApiTags('Announcements')
@ApiBearerAuth('jwt')
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @Roles(UserRole.KIOSK_OWNER)
  @ApiOperation({
    summary:
      "Create an announcement (admin specifies kioskId; kiosk-owner's own kiosk is implied)",
  })
  @ApiResponse({ status: 201, description: 'Announcement created' })
  create(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(currentUser, dto);
  }

  @Post('upload-image')
  @Roles(UserRole.KIOSK_OWNER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: "Upload an image for use as an announcement's mediaUrl",
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded',
    type: UploadAnnouncementImageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Missing file, or wrong type' })
  @ApiResponse({ status: 413, description: 'File exceeds the 5MB limit' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
          callback(null, UPLOAD_DIR);
        },
        filename: (_req, file, callback) => {
          callback(null, `${randomUUID()}${path.extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        callback(null, ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype));
      },
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): UploadAnnouncementImageResponseDto {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded, or it was rejected. Only PNG/JPEG/WebP/GIF up to 5MB are accepted',
      );
    }
    const baseUrl =
      this.configService.get<string>('PUBLIC_BACKEND_URL') ??
      'http://localhost:3000';
    return { url: `${baseUrl}/uploads/announcements/${file.filename}` };
  }

  @Get()
  @Roles(UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @ApiOperation({
    summary: 'List announcements',
    description:
      "Admin sees all announcements; kiosk-owner sees their own kiosk's announcements; " +
      'location-manager sees only announcements scoped to all locations or overlapping their assigned locations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Announcements visible to the caller',
  })
  findAll(@CurrentUser() currentUser: JwtPayload) {
    return this.announcementsService.findAll(currentUser);
  }

  @Get(':id')
  @Roles(UserRole.KIOSK_OWNER, UserRole.LOCATION_MANAGER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.ANNOUNCEMENT_VIEW)
  @ApiOperation({
    summary: 'Get an announcement by id',
    description:
      'Kiosk-owner and location-manager get read-only visibility into platform-wide ' +
      "broadcasts and their own kiosk's announcements (location-manager further scoped to " +
      'their assigned locations). Only ADMIN or the owning KIOSK_OWNER can PATCH/DELETE one.',
  })
  @ApiResponse({ status: 200, description: 'The announcement' })
  @ApiResponse({ status: 403, description: "Not in the caller's tenant scope" })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  findOne(@Param('id') id: string) {
    return this.announcementsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.ANNOUNCEMENT)
  @ApiOperation({ summary: 'Update an announcement' })
  @ApiResponse({ status: 200, description: 'Announcement updated' })
  @ApiResponse({ status: 403, description: "Not in the caller's tenant scope" })
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.KIOSK_OWNER)
  @UseGuards(TenantScopeGuard)
  @TenantResource(TenantResourceType.ANNOUNCEMENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an announcement' })
  @ApiResponse({ status: 204, description: 'Announcement deleted' })
  @ApiResponse({
    status: 403,
    description: 'Not allowed for this role or tenant',
  })
  remove(@Param('id') id: string) {
    return this.announcementsService.remove(id);
  }
}
