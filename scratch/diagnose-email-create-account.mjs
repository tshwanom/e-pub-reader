/**
 * Diagnostic: EmailCreateAccount root cause investigation
 * Tests: DB schema, user lookup, and simulated createUser call
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

console.log('==============================================');
console.log('  NextAuth EmailCreateAccount Diagnostic');
console.log('==============================================\n');

// ── 1. Check if emailVerified column exists ────────────────────────────────
console.log('▶ 1. Checking if "emailVerified" column exists in User table...');
try {
  const result = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'User'
      AND column_name  = 'emailVerified';
  `;
  if (Array.isArray(result) && result.length > 0) {
    console.log('   ✅ emailVerified column EXISTS:', result[0]);
  } else {
    console.log('   ❌ emailVerified column is MISSING from the User table!');
    console.log('      This is almost certainly the cause of EmailCreateAccount.');
  }
} catch (err) {
  console.error('   ❌ Query failed:', err.message);
}

// ── 2. List all columns in User table ─────────────────────────────────────
console.log('\n▶ 2. All columns in the User table:');
try {
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
    ORDER BY ordinal_position;
  `;
  for (const col of cols) {
    console.log(`   • ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
  }
} catch (err) {
  console.error('   ❌ Query failed:', err.message);
}

// ── 3. Try creating a test user the way NextAuth would ────────────────────
console.log('\n▶ 3. Simulating NextAuth createUser call (will rollback)...');
const TEST_EMAIL = `__nextauth_test_${Date.now()}@example.com`;
try {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: TEST_EMAIL,
        name:  null,
        // NextAuth PrismaAdapter sets emailVerified on creation:
        emailVerified: new Date(),
      },
    });
    console.log('   ✅ createUser succeeded — user would have been created OK.');
    console.log('      (rolling back test record)');
    throw new Error('ROLLBACK_INTENTIONAL');
  });
} catch (err) {
  if (err.message === 'ROLLBACK_INTENTIONAL') {
    // success path (rollback is intentional)
  } else {
    console.log('   ❌ createUser FAILED with error:');
    console.log('     ', err.message);
    if (err.message.includes('emailVerified')) {
      console.log('\n   🔑 ROOT CAUSE CONFIRMED: emailVerified field is missing from the schema.');
      console.log('      Fix: add "emailVerified DateTime?" to the User model and run a migration.');
    }
  }
}

// ── 4. Check NEXTAUTH_URL ──────────────────────────────────────────────────
console.log('\n▶ 4. Checking NEXTAUTH_URL...');
const nextauthUrl = process.env.NEXTAUTH_URL;
if (!nextauthUrl) {
  console.log('   ❌ NEXTAUTH_URL is not set!');
} else if (nextauthUrl.includes('localhost')) {
  console.log(`   ⚠️  NEXTAUTH_URL = "${nextauthUrl}"`);
  console.log('      WARNING: This points to localhost. On production it must be https://1manrevolution.com');
} else {
  console.log(`   ✅ NEXTAUTH_URL = "${nextauthUrl}"`);
}

await prisma.$disconnect();
console.log('\n==============================================');
console.log('  Diagnostic complete');
console.log('==============================================');
