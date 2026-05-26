import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaMode: 'accelerate' | 'direct' | undefined
}

const databaseUrl = process.env.DATABASE_URL ?? ''
const usesAccelerateProtocol =
  databaseUrl.startsWith('prisma://')
  || databaseUrl.startsWith('prisma+postgres://')
const prismaMode = usesAccelerateProtocol ? 'accelerate' : 'direct'

function createPrismaClient() {
  if (usesAccelerateProtocol) {
    return new PrismaClient()
  }

  // Some installs can leave Prisma generated with `copyEngine: false`, which
  // makes a normal `postgresql://` connection string go through the
  // Accelerate/Data Proxy path and explode with a `prisma://` protocol error.
  const options = {
    __internal: {
      configOverride: (config: Record<string, unknown>) => ({
        ...config,
        copyEngine: true,
      }),
    },
  } as unknown as ConstructorParameters<typeof PrismaClient>[0]

  return new PrismaClient(options)
}

function getPrismaClient() {
  if (globalForPrisma.prisma && globalForPrisma.prismaMode === prismaMode) {
    return globalForPrisma.prisma
  }

  void globalForPrisma.prisma?.$disconnect().catch(() => {})

  return createPrismaClient()
}

export const prisma = getPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaMode = prismaMode
}
