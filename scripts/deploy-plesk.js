const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const ROOT_DIR = path.join(__dirname, '..');
const ZIP_NAME = 'plesk-deploy.zip';
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

dotenv.config({ path: path.join(ROOT_DIR, '.env') });
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const PLESK_SSH_HOST = (process.env.PLESK_SSH_HOST || '').trim();
const PLESK_SSH_USER = (process.env.PLESK_SSH_USER || '').trim();
const PLESK_SSH_PORT = (process.env.PLESK_SSH_PORT || '22').trim();
const PLESK_REMOTE_PATH = (process.env.PLESK_REMOTE_PATH || '').trim();
const PLESK_SSH_KEY = (process.env.PLESK_SSH_KEY || '').trim();
const PLESK_REMOTE_ZIP_NAME = (process.env.PLESK_REMOTE_ZIP_NAME || ZIP_NAME).trim();
const PLESK_INSTALL_COMMAND = (process.env.PLESK_INSTALL_COMMAND || 'npm ci --no-audit --no-fund').trim();
const PLESK_RESTART_COMMAND = (process.env.PLESK_RESTART_COMMAND || 'mkdir -p tmp && touch tmp/restart.txt').trim();

const RUN_PRISMA_GENERATE = parseBoolean(process.env.PLESK_RUN_PRISMA_GENERATE, true);
const RUN_MIGRATIONS = parseBoolean(process.env.PLESK_RUN_MIGRATIONS, true);
const SKIP_BUILD = parseBoolean(process.env.PLESK_SKIP_BUILD, false);

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function toPosixPath(input) {
  const normalized = input.replace(/\\/g, '/');
  if (normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/+$/, '');
}

function shellQuote(input) {
  return `'${String(input).replace(/'/g, `'\\''`)}'`;
}

function runCommand(command, args, options = {}) {
  const printable = `${command} ${args.join(' ')}`;
  console.log(`\n$ ${printable}`);

  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    ...options
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(
        `Command "${command}" was not found. Ensure it is installed and available in PATH.`
      );
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${printable}`);
  }
}

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function validateRequiredConfig() {
  const required = {
    PLESK_SSH_HOST,
    PLESK_SSH_USER,
    PLESK_REMOTE_PATH
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    fail(
      `Missing required deployment variables: ${missing.join(', ')}. ` +
      'Add them to your .env file (see .env.example).'
    );
  }
}

try {
  console.log('🚀 Starting one-command Plesk deployment...');

  validateRequiredConfig();

  if (!SKIP_BUILD) {
    console.log('\n🔨 Building and packaging application...');
    runCommand(NPM_CMD, ['run', 'build:plesk']);
  } else {
    console.log('\n⏭️ Skipping build step because PLESK_SKIP_BUILD=true');
  }

  const zipPath = path.join(ROOT_DIR, ZIP_NAME);
  if (!fs.existsSync(zipPath)) {
    fail(`${ZIP_NAME} was not found. Run "npm run build:plesk" first or disable PLESK_SKIP_BUILD.`);
  }

  const sshTarget = `${PLESK_SSH_USER}@${PLESK_SSH_HOST}`;
  const remotePath = toPosixPath(PLESK_REMOTE_PATH);
  const remoteZipPath = `${remotePath}/${PLESK_REMOTE_ZIP_NAME}`;

  const sshArgs = [];
  const scpArgs = [];

  if (PLESK_SSH_KEY) {
    sshArgs.push('-i', PLESK_SSH_KEY);
    scpArgs.push('-i', PLESK_SSH_KEY);
  }

  if (PLESK_SSH_PORT) {
    sshArgs.push('-p', PLESK_SSH_PORT);
    scpArgs.push('-P', PLESK_SSH_PORT);
  }

  console.log(`\n📤 Uploading ${ZIP_NAME} to ${sshTarget}:${remotePath}...`);
  runCommand('scp', [
    ...scpArgs,
    zipPath,
    `${sshTarget}:${shellQuote(remoteZipPath)}`
  ]);

  const remoteCommands = [
    'set -euo pipefail',
    `cd ${shellQuote(remotePath)}`,
    `if [ ! -f ${shellQuote(PLESK_REMOTE_ZIP_NAME)} ]; then echo "❌ ${PLESK_REMOTE_ZIP_NAME} not found after upload."; exit 1; fi`,
    'if command -v unzip >/dev/null 2>&1; then',
    `  unzip -o ${shellQuote(PLESK_REMOTE_ZIP_NAME)}`,
    'elif command -v bsdtar >/dev/null 2>&1; then',
    `  bsdtar -xf ${shellQuote(PLESK_REMOTE_ZIP_NAME)}`,
    'else',
    '  echo "❌ Neither unzip nor bsdtar is installed on the server."',
    '  exit 1',
    'fi',
    `rm -f ${shellQuote(PLESK_REMOTE_ZIP_NAME)}`,
    PLESK_INSTALL_COMMAND,
    RUN_PRISMA_GENERATE
      ? 'npx prisma generate'
      : 'echo "ℹ️ Skipping Prisma client generation (PLESK_RUN_PRISMA_GENERATE=false)."',
    RUN_MIGRATIONS
      ? 'npx prisma migrate deploy'
      : 'echo "ℹ️ Skipping database migrations (PLESK_RUN_MIGRATIONS=false)."',
    PLESK_RESTART_COMMAND || 'echo "ℹ️ No restart command configured. Restart from the Plesk Node.js panel."'
  ].join('\n');

  console.log('\n🛠️ Running remote deployment steps...');
  runCommand('ssh', [
    ...sshArgs,
    sshTarget,
    'bash',
    '-lc',
    remoteCommands
  ]);

  console.log('\n✅ Deployment complete!');
  console.log('If your Plesk setup uses a custom restart flow, set PLESK_RESTART_COMMAND in .env.');
} catch (error) {
  fail(error.message || 'Deployment failed.');
}
