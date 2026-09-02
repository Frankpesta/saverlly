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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { imageSize } from 'image-size';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { UploadPromotionImageResponseDto } from './dto/upload-promotion-image-response.dto';
import {
  PROMOTION_CREATIVE_SIZES,
  isPromotionCreativeSize,
  validateCreativeDimensions,
} from './promotion-creative-size.util';
import { PromotionsService } from './promotions.service';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'promotions');
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('Promotions')
@ApiBearerAuth('jwt')
@Controller('promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a promotion shown in the Chrome extension popup',
  })
  @ApiResponse({ status: 201, description: 'Promotion created' })
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Post('upload-image')
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'size',
    enum: ['small', 'large'],
    description:
      'Which creative slot this upload is for — determines the dimensions enforced ' +
      `(small = ${PROMOTION_CREATIVE_SIZES.small.width}x${PROMOTION_CREATIVE_SIZES.small.height}, ` +
      `large = ${PROMOTION_CREATIVE_SIZES.large.width}x${PROMOTION_CREATIVE_SIZES.large.height}).`,
  })
  @ApiOperation({ summary: 'Upload one of a promotion’s two creatives' })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded',
    type: UploadPromotionImageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing file, wrong type, unknown size, or wrong dimensions',
  })
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
    @Query('size') size?: string,
  ): UploadPromotionImageResponseDto {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded, or it was rejected — only PNG/JPEG/WebP/GIF up to 5MB are accepted',
      );
    }
    // Multer has already written the file to disk by the time this runs, so every rejection below
    // has to clean up after itself or the upload dir slowly fills with orphaned creatives.
    if (!isPromotionCreativeSize(size)) {
      this.discard(file.path);
      throw new BadRequestException(
        "The `size` query param is required and must be either 'small' or 'large'",
      );
    }

    let dimensions: { width: number; height: number };
    try {
      const measured = imageSize(fs.readFileSync(file.path));
      dimensions = { width: measured.width, height: measured.height };
    } catch {
      this.discard(file.path);
      throw new BadRequestException(
        'Could not read the image dimensions — the file may be corrupt or not a real image',
      );
    }

    const problem = validateCreativeDimensions(size, dimensions);
    if (problem) {
      this.discard(file.path);
      throw new BadRequestException(problem);
    }

    const baseUrl =
      this.configService.get<string>('PUBLIC_BACKEND_URL') ??
      'http://localhost:3000';
    return {
      url: `${baseUrl}/uploads/promotions/${file.filename}`,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all promotions, newest first' })
  @ApiResponse({ status: 200, description: 'Promotions' })
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a promotion by id' })
  @ApiResponse({ status: 200, description: 'The promotion' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a promotion' })
  @ApiResponse({ status: 200, description: 'Promotion updated' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a promotion' })
  @ApiResponse({ status: 204, description: 'Promotion deleted' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id);
  }

  private discard(filePath: string): void {
    fs.rmSync(filePath, { force: true });
  }
}
