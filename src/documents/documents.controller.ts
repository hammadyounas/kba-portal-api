import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { CreateDocumentDto } from './dto/create-document.dto';
import { PublishedQueryDto } from './dto/published-query.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';

const upload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF, Role.ADMIN)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.documentsService.listForStaff(user);
  }

  @Public()
  @Get('published')
  listPublished(@Query() query: PublishedQueryDto) {
    return this.documentsService.searchPublished(query);
  }

  @Public()
  @Get('published/catalog')
  listCatalog() {
    return this.documentsService.listPublishedCatalog();
  }

  @Public()
  @Get('published/:id')
  getPublished(@Param('id') id: string) {
    return this.documentsService.getPublished(id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.getById(id, user);
  }

  @Get(':id/purchasers')
  @Roles(Role.ADMIN)
  purchasers(@Param('id') id: string) {
    return this.documentsService.listPurchasers(id);
  }

  @Get(':id/file')
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.getPrivateFile(id, user, authorization);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.originalName)}"`,
    );
    res.send(file.buffer);
  }

  @Post()
  @UseInterceptors(upload)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.create(user, dto, file);
  }

  @Post(':id/review')
  @Roles(Role.ADMIN)
  review(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documentsService.review(id, user, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(id, user, dto);
  }

  @Put(':id/file')
  @UseInterceptors(upload)
  replaceFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.replaceFile(id, user, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.remove(id, user);
  }
}
