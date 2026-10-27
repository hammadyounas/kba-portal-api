import { AccountStatus, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const users = [
    {
      email: 'admin@kba.local',
      fullName: 'KBA Admin',
      role: Role.ADMIN,
    },
    {
      email: 'staff@kba.local',
      fullName: 'KBA Staff',
      role: Role.STAFF,
    },
    {
      email: 'public@kba.local',
      fullName: 'Public Member',
      role: Role.PUBLIC,
    },
  ] as const;

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        role: user.role,
        passwordHash,
        accountStatus: AccountStatus.ACTIVE,
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        passwordHash,
        accountStatus: AccountStatus.ACTIVE,
      },
    });
  }

  const categories = [
    {
      name: 'Judgments',
      slug: 'judgments',
      description: 'Court judgments and orders',
    },
    {
      name: 'Circulars',
      slug: 'circulars',
      description: 'Bar association circulars',
    },
    {
      name: 'Notices',
      slug: 'notices',
      description: 'Public and member notices',
    },
  ] as const;

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
      },
      create: category,
    });
  }

  console.log('Seeded users (password for all: Password123!):');
  for (const user of users) {
    console.log(`  - ${user.role}: ${user.email}`);
  }
  console.log('Seeded categories:', categories.map((c) => c.name).join(', '));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
