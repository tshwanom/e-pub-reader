require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { hash } = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const password = await hash(rawPassword, 12)

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
