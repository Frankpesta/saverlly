import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
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
}
