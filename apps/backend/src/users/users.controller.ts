import {
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
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

@ApiTags('Users')
@ApiBearerAuth('jwt')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
