import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

console.log('--- Inspecting _prisma_migrations ---');
try {
  const migrations = await prisma.$queryRaw`
    SELECT id, checksum, finished_at, migration_name, rolled_back_at, started_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at;
  `;
  console.log(migrations);
} catch (err) {
  console.error('Failed to query migrations table:', err.message);
}

await prisma.$disconnect();
