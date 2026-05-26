import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

async function checkColumn(table, column) {
  const result = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = '${table}'
      AND column_name  = '${column}';
  `);
  if (result.length > 0) {
    console.log(`✅ Table "${table}" has column "${column}" (${result[0].data_type})`);
    return true;
  } else {
    console.log(`❌ Table "${table}" is MISSING column "${column}"`);
    return false;
  }
}

async function checkType(typeName) {
  const result = await prisma.$queryRawUnsafe(`
    SELECT typname FROM pg_type WHERE typname = '${typeName}';
  `);
  if (result.length > 0) {
    console.log(`✅ Custom Type "${typeName}" EXISTS`);
    return true;
  } else {
    console.log(`❌ Custom Type "${typeName}" is MISSING`);
    return false;
  }
}

console.log('--- Inspecting DB schema fields ---');
try {
  await checkColumn('SupplementaryContent', 'narrationSourceHash');
  await checkColumn('ContentNarration', 'sourceHash');
  await checkColumn('ContentNarration', 'stylePrompt');
  await checkColumn('BookNarration', 'stylePrompt');
  await checkColumn('BookNarration', 'jobKey');
  await checkType('DonationFrequency');
  await checkColumn('Donation', 'frequency');
  await checkColumn('Donation', 'paystackPlanCode');
  await checkColumn('Donation', 'paystackSubscriptionCode');
  await checkColumn('Donation', 'paystackCustomerCode');
} catch (err) {
  console.error('Inspection failed:', err.message);
}

await prisma.$disconnect();
