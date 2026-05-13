const { startServer } = require('./server-runtime')

startServer().catch((error) => {
  console.error('Failed to start the production server.', error)
  process.exit(1)
})
