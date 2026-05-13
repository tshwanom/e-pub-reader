const { spawnSync } = require('child_process');

process.env.NODE_ENV = 'production';

const nextBin = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
