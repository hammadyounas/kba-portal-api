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
      where: { active: true },
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

  async update(
    id: string,
    input: { name?: string; description?: string; active?: boolean },
  ) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const data: {
      name?: string;
      slug?: string;
      description?: string | null;
      active?: boolean;
    } = {};

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      const slug = this.slugify(trimmed);
      const existing = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          OR: [{ name: trimmed }, { slug }],
        },
      });
      if (existing) {
        throw new ConflictException('Category already exists');
      }
      data.name = trimmed;
      data.slug = slug;
    }

    if (input.description !== undefined) {
      data.description = input.description.trim() || null;
    }

    if (input.active !== undefined) {
      data.active = input.active;
    }

    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    const used = await this.prisma.document.count({
      where: { categoryId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        used === 1
          ? 'This category is still used by a document. Move that record before deleting it.'
          : `This category is still used by ${used} documents. Move those records before deleting it.`,
      );
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
