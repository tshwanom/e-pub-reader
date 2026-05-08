require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { hash } = require('bcryptjs')

const prisma = new PrismaClient()

function trimEnv(value) {
  return value?.trim() || ''
}

function getPersistedNarrationStorageProvider() {
  const explicitProvider = trimEnv(process.env.NARRATION_STORAGE_PROVIDER).toLowerCase()

  if (explicitProvider === 'local') {
    return 'LOCAL'
  }

  if (explicitProvider === 'r2') {
    return 'R2'
  }

  if (explicitProvider === 'b2') {
    return 'B2'
  }

  if (explicitProvider === 's3') {
    return 'S3'
  }

  if (
    trimEnv(process.env.R2_ACCOUNT_ID)
    || trimEnv(process.env.R2_ACCESS_KEY_ID)
    || trimEnv(process.env.R2_BUCKET_NAME)
  ) {
    return 'R2'
  }

  if (
    trimEnv(process.env.B2_ENDPOINT)
    || trimEnv(process.env.B2_ACCESS_KEY_ID)
    || trimEnv(process.env.B2_KEY_ID)
    || trimEnv(process.env.B2_APPLICATION_KEY)
    || trimEnv(process.env.B2_BUCKET_NAME)
  ) {
    return 'B2'
  }

  return 'S3'
}

async function main() {
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const password = await hash(rawPassword, 12)
  const storageProvider = getPersistedNarrationStorageProvider()

  const admin = await prisma.user.upsert({
    where: { email: 'mookamedi@1manrevolution.com' },
    update: {},
    create: {
      email: 'mookamedi@1manrevolution.com',
      name: 'Admin',
      password,
      role: 'ADMIN',
    },
  })

  console.log('Admin seeded:', admin.email)

  const classicVoice = await prisma.narrationVoice.upsert({
    where: { slug: 'classic-narrator' },
    update: {
      name: 'Classic Narrator',
      provider: 'manual-seed',
      language: 'en',
      description: 'Warm, composed donor narration voice for long-form reading.',
      sampleText: 'This is a seeded narration voice for donor audiobook previews.',
    },
    create: {
      slug: 'classic-narrator',
      name: 'Classic Narrator',
      provider: 'manual-seed',
      language: 'en',
      description: 'Warm, composed donor narration voice for long-form reading.',
      sampleText: 'This is a seeded narration voice for donor audiobook previews.',
    },
  })

  const contemplativeVoice = await prisma.narrationVoice.upsert({
    where: { slug: 'contemplative-reader' },
    update: {
      name: 'Contemplative Reader',
      provider: 'manual-seed',
      language: 'en',
      description: 'Soft-spoken fallback narration voice for future donor releases.',
      sampleText: 'Another seeded voice option for narrated donor editions.',
    },
    create: {
      slug: 'contemplative-reader',
      name: 'Contemplative Reader',
      provider: 'manual-seed',
      language: 'en',
      description: 'Soft-spoken fallback narration voice for future donor releases.',
      sampleText: 'Another seeded voice option for narrated donor editions.',
    },
  })

  console.log('Narration voices seeded:', classicVoice.slug, ',', contemplativeVoice.slug)

  const sampleBook = await prisma.book.findFirst({
    orderBy: [
      { publishedAt: 'desc' },
      { createdAt: 'asc' },
    ],
  })

  if (!sampleBook) {
    console.log('No books found; skipping example narration seed.')
    return
  }

  const exampleNarration = await prisma.bookNarration.upsert({
    where: {
      bookId_voiceId: {
        bookId: sampleBook.id,
        voiceId: classicVoice.id,
      },
    },
    update: {
      status: 'PENDING',
      storageProvider,
      active: true,
      totalChapters: 1,
      totalDurationMs: null,
      manifestObjectKey: null,
      audioMimeType: 'audio/mpeg',
      readyAt: null,
      errorMessage: null,
    },
    create: {
      bookId: sampleBook.id,
      voiceId: classicVoice.id,
      status: 'PENDING',
      storageProvider,
      active: true,
      totalChapters: 1,
      totalDurationMs: null,
      manifestObjectKey: null,
      audioMimeType: 'audio/mpeg',
      readyAt: null,
      errorMessage: null,
    },
  })

  await prisma.bookNarration.updateMany({
    where: {
      bookId: sampleBook.id,
      NOT: { id: exampleNarration.id },
    },
    data: { active: false },
  })

  await prisma.narrationChapter.deleteMany({
    where: { narrationId: exampleNarration.id },
  })

  await prisma.narrationChapter.create({
    data: {
      narrationId: exampleNarration.id,
      chapterIndex: 0,
      title: 'Narration Queue Placeholder',
      spineHref: 'seeded-placeholder.xhtml',
      status: 'PENDING',
      audioObjectKey: null,
      audioMimeType: 'audio/mpeg',
      durationMs: null,
      cues: {
        create: [
          {
            sequence: 0,
            startMs: 0,
            endMs: 1,
            targetHref: 'seeded-placeholder.xhtml#intro',
            targetElementId: 'intro',
            targetCfi: null,
            excerpt: 'Seeded placeholder cue for donor narration setup.',
          },
        ],
      },
    },
  })

  console.log('Example narration seeded for book:', sampleBook.title, `(${storageProvider})`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
