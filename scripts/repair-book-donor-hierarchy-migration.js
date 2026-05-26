const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MIGRATION_NAME = '20260525133000_book_donor_hierarchy';
const SCHEMA_PATH = 'prisma/schema.prisma';
const REPAIR_SQL_PATH = `prisma/repairs/${MIGRATION_NAME}_repair.sql`;

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

console.log('🔧 Repairing Prisma migration 20260525133000_book_donor_hierarchy...');
console.log('This helper completes any missing SQL for the donor access column and then marks the failed migration as applied.');

runCommand(NPX_CMD, ['prisma', 'db', 'execute', '--file', REPAIR_SQL_PATH, '--schema', SCHEMA_PATH]);
runCommand(NPX_CMD, ['prisma', 'migrate', 'resolve', '--applied', MIGRATION_NAME, '--schema', SCHEMA_PATH]);

console.log('\n🎉 Repair complete. Re-run `npm run deploy:plesk` and then restart the app in Plesk.');
