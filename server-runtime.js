const { spawnSync } = require('child_process')
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

function isFalseyEnvValue(value) {
  return /^(0|false|no|off)$/i.test(String(value ?? '').trim())
}

function shouldRunPrismaMigrations() {
  const environment = process.env.NODE_ENV || 'production'

  if (environment !== 'production') {
    return false
  }

  return !isFalseyEnvValue(process.env.AUTO_RUN_PRISMA_MIGRATIONS ?? 'true')
}

function runPrismaMigrations() {
  if (!shouldRunPrismaMigrations()) {
    return
  }

  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

  console.log('> Applying Prisma migrations before starting the server...')

  const result = spawnSync(npxCommand, ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })

  if (result.error) {
    console.error('> Failed to start Prisma migration command.')
    console.error(result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`> Prisma migration command exited with code ${result.status}.`)
    process.exit(result.status ?? 1)
  }
}

async function startServer() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production'

  runPrismaMigrations()

  const dev = process.env.NODE_ENV !== 'production'
  const hostname = process.env.HOSTNAME || 'localhost'
  const port = Number(process.env.PORT || 3001)

  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })
}

module.exports = {
  isFalseyEnvValue,
  shouldRunPrismaMigrations,
  runPrismaMigrations,
  startServer,
}