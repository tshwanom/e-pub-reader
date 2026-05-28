const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const MIGRATION_NAME = '20260511120000_content_admin_narration';
const SCHEMA_PATH = 'prisma/schema.prisma';

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

console.log('🔧 Repairing Prisma migration 20260511120000_content_admin_narration...');
console.log('This helper marks the failed migration as rolled-back so Prisma can retry applying it successfully.');

runCommand(NPX_CMD, ['prisma', 'migrate', 'resolve', '--rolled-back', MIGRATION_NAME, '--schema', SCHEMA_PATH]);

console.log('\n🎉 Repair complete. Re-run `npm run deploy:plesk` and then restart the app in Plesk.');
