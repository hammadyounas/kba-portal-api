import { Module } from '@nestjs/common';
import { CategoriesController } from '../categories/categories.controller';
import { CategoriesService } from '../categories/categories.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { OcrService } from './ocr.service';

@Module({
  controllers: [DocumentsController, CategoriesController],
  providers: [DocumentsService, CategoriesService, OcrService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
