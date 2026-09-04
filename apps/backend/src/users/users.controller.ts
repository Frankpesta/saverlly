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
  NotFoundException,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { DismissAlertDto } from './dto/dismiss-alert.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

const AVATAR_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'avatars');
const ALLOWED_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
];
// Deliberately smaller than the 5MB promotion-creative limit: an avatar is displayed at
// 96px, so anything approaching that size is a phone photo nobody needed to upload.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

@ApiTags('Users')
@ApiBearerAuth('jwt')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current authenticated user\'s own profile' })
  @ApiResponse({ status: 200, description: 'The current user (password/refresh-token hashes never included)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async me(@CurrentUser() currentUser: JwtPayload) {
    const user = await this.usersService.findById(currentUser.sub);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { passwordHash: _passwordHash, refreshTokenHash: _refreshTokenHash, ...safeUser } = user;
    return safeUser;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Update the current authenticated user's own profile. Email only, not role/kiosk/managedLocationIds",
  })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async updateMe(@CurrentUser() currentUser: JwtPayload, @Body() dto: UpdateMeDto) {
    const user = await this.usersService.updateMe(currentUser.sub, dto);
    const { passwordHash: _passwordHash, refreshTokenHash: _refreshTokenHash, ...safeUser } = user;
    return safeUser;
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: "Upload the current user's profile photo",
    description:
      'Stores the file under /uploads/avatars and sets avatarUrl on the account. Replacing an ' +
      'existing photo deletes the previous file. Returns the updated user.',
  })
  @ApiResponse({ status: 201, description: 'Avatar uploaded, updated user returned' })
  @ApiResponse({ status: 400, description: 'Missing file, or not a PNG/JPEG/WebP' })
  @ApiResponse({ status: 413, description: 'File exceeds the 2MB limit' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
          callback(null, AVATAR_UPLOAD_DIR);
        },
        filename: (_req, file, callback) => {
          callback(null, `${randomUUID()}${path.extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        callback(null, ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype));
      },
      limits: { fileSize: MAX_AVATAR_BYTES },
    }),
  )
  async uploadAvatar(
    @CurrentUser() currentUser: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded, or it was rejected. Only PNG/JPEG/WebP up to 2MB are accepted',
      );
    }
    const baseUrl =
      this.configService.get<string>('PUBLIC_BACKEND_URL') ??
      'http://localhost:3000';
    const user = await this.usersService.setAvatar(
      currentUser.sub,
      `${baseUrl}/uploads/avatars/${file.filename}`,
    );
    const {
      passwordHash: _passwordHash,
      refreshTokenHash: _refreshTokenHash,
      ...safeUser
    } = user;
    return safeUser;
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Remove the current user's profile photo" })
  @ApiResponse({ status: 200, description: 'Avatar removed, updated user returned' })
  async removeAvatar(@CurrentUser() currentUser: JwtPayload) {
    const user = await this.usersService.setAvatar(currentUser.sub, null);
    const {
      passwordHash: _passwordHash,
      refreshTokenHash: _refreshTokenHash,
      ...safeUser
    } = user;
    return safeUser;
  }

  @Get('me/dismissed-alerts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "List alertKeys the current user has dismissed from the admin Overview 'Needs attention' panel",
  })
  @ApiResponse({ status: 200, description: 'Array of dismissed alertKey strings' })
  myDismissedAlerts(@CurrentUser() currentUser: JwtPayload) {
    return this.usersService.findDismissedAlertKeys(currentUser.sub);
  }

  @Post('me/dismissed-alerts')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Dismiss one 'Needs attention' item for the current user. Idempotent",
  })
  @ApiResponse({ status: 204, description: 'Dismissed' })
  async dismissAlert(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: DismissAlertDto,
  ) {
    await this.usersService.dismissAlert(currentUser.sub, dto.alertKey);
  }

  @Delete('me/dismissed-alerts/:alertKey')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Un-dismiss a previously dismissed 'Needs attention' item. Idempotent",
  })
  @ApiResponse({ status: 204, description: 'Un-dismissed' })
  async undismissAlert(
    @CurrentUser() currentUser: JwtPayload,
    @Param('alertKey') alertKey: string,
  ) {
    await this.usersService.undismissAlert(currentUser.sub, alertKey);
  }

  @Post('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create another ADMIN-level teammate. Generates a password server-side' })
  @ApiResponse({ status: 201, description: 'Admin created, generated password returned once' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  createAdmin(@Body() dto: CreateAdminUserDto) {
    return this.usersService.createAdmin(dto);
  }

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List every ADMIN-level user' })
  @ApiResponse({ status: 200, description: 'Admin users' })
  findAdmins() {
    return this.usersService.findAdmins();
  }

  @Patch('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Rename, disable, or re-enable an admin' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 400, description: 'Cannot disable your own account' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  updateAdmin(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.usersService.updateAdmin(id, currentUser.sub, dto);
  }

  @Delete('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an admin, an admin cannot delete their own account this way' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete your own account, or admin not found' })
  removeAdmin(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    return this.usersService.removeAdmin(id, currentUser.sub);
  }
}
