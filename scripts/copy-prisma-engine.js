const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const fileName = 'libquery_engine-rhel-openssl-3.0.x.so.node';
const source = join(__dirname, '../node_modules/.prisma/client', fileName);
const destinationDir = join(__dirname, '../prisma/engines');

if (!existsSync(source)) {
  console.warn('Prisma linux engine was not generated, so it was not copied.');
  process.exit(0);
}

mkdirSync(destinationDir, { recursive: true });
copyFileSync(source, join(destinationDir, fileName));
