const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const SCHEMA_PATH = 'prisma/schema.prisma';

const MIGRATIONS = [
  '20260511120000_content_admin_narration',
  '20260511153000_content_narration_sync',
  '20260511170000_book_narration_queue',
  '20260522120000_paystack_recurring_support',
  '20260524013600_add_email_verified_to_user',
  '20260525133000_book_donor_hierarchy',
  '20260527120000_content_donor_access',
  '20260527153000_content_comments',
  '20260527180000_book_status_tags'
];

function runCommand(command, args) {
  const printable = `${command} ${args.join(' ')}`;
  console.log(`\n========================================`);
  console.log(`▶ Running: ${printable}`);
  console.log(`========================================\n`);

  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`\n❌ Failed to start command: ${printable}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\n❌ Command failed with exit code ${result.status}: ${printable}`);
    process.exit(1);
  }

  console.log(`\n✅ Finished: ${printable}\n`);
}

console.log('🚀 Bootstrapping Plesk Production Database from scratch...');

// 1. Run db push to create all tables and types safely
console.log('\n1️⃣ Pushing schema to create tables...');
runCommand(NPX_CMD, ['prisma', 'db', 'push', '--schema', SCHEMA_PATH, '--accept-data-loss']);

// 2. Resolve all migrations as applied so they are in sync
console.log('\n2️⃣ Registering all migrations as applied...');
for (const migration of MIGRATIONS) {
  console.log(`\nRegistering ${migration}...`);
  runCommand(NPX_CMD, ['prisma', 'migrate', 'resolve', '--applied', migration, '--schema', SCHEMA_PATH]);
}

console.log('\n🎉 Database bootstrap complete! You can now run `npm run deploy:plesk` successfully.');
