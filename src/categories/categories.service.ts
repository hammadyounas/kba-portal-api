import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async listPublic() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: {
            documents: { where: { status: DocumentStatus.PUBLISHED } },
          },
        },
      },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      publishedCount: category._count.documents,
    }));
  }

  async create(name: string, description?: string) {
    const trimmed = name.trim();
    const slug = this.slugify(trimmed);
    const existing = await this.prisma.category.findFirst({
      where: { OR: [{ name: trimmed }, { slug }] },
    });
    if (existing) {
      throw new ConflictException('Category already exists');
    }

    return this.prisma.category.create({
      data: {
        name: trimmed,
        slug,
        description: description?.trim() || null,
      },
    });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
