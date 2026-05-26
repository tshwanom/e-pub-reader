const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runCommand(command, args, env = {}) {
  const printable = `${command} ${args.join(' ')}`;
  console.log(`\n========================================`);
  console.log(`▶ Running: ${printable}`);
  console.log(`========================================\n`);

  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });

  if (result.error) {
    console.error(`\n❌ Failed to start command: ${printable}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (command === NPX_CMD && args.join(' ') === 'prisma migrate deploy') {
      console.error('\n💡 Prisma migration recovery hint:');
      console.error('   If this failed with P3009 for 20260525133000_book_donor_hierarchy, run:');
      console.error('   npm run repair:book-donor-hierarchy');
      console.error('   Then re-run:');
      console.error('   npm run deploy:plesk');
    }

    console.error(`\n❌ Command failed with exit code ${result.status}: ${printable}`);
    process.exit(1);
  }
  
  console.log(`\n✅ Finished: ${printable}\n`);
}

console.log('🚀 Starting Server-Side Deployment Build...');

try {
  // 1. Install Dependencies
  runCommand(NPM_CMD, ['install']);

  // 2. Apply pending Prisma migrations
  runCommand(NPX_CMD, ['prisma', 'migrate', 'deploy']);

  // 3. Generate Prisma Client
  runCommand(NPX_CMD, ['prisma', 'generate']);

  // 4. Build Next.js App
  // Force production mode to ensure optimized build
  runCommand(NPM_CMD, ['run', 'build'], { NODE_ENV: 'production' });

  console.log('\n🎉 Server deployment script completed successfully!');
  console.log('You can now click "Restart App" in your Plesk Node.js interface.');

} catch (error) {
  console.error('\n💥 Deployment script encountered an unexpected error:');
  console.error(error);
  process.exit(1);
}
