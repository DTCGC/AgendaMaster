import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import bcrypt from 'bcryptjs'

import 'dotenv/config'

const dbUrl = process.env.DATABASE_URL!.replace('file:', '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  const csvPath = path.join(process.cwd(), 'Gavel Club MM_DD - [MEETING THEME HERE] - Sheet1.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  // Check if template already exists to avoid duplication on re-seeding
  const existing = await prisma.meetingTemplate.findFirst({
    where: { type: 'Regular' }
  });

  if (!existing) {
    await prisma.meetingTemplate.create({
      data: {
        type: 'Regular',
        schemaStructure: csvContent,
      },
    });
    console.log('Database seeded with standard "Regular" Meeting Template.')
  } else {
    console.log('Template already exists. Skipping meeting template seed.')
  }

  // Create Test Admin User
  const adminEmail = 'admin@test.com'
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('password123', 10)
    await prisma.user.create({
      data: {
        email: adminEmail,
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        passwordHash,
      }
    })
    console.log(`Test admin created: ${adminEmail} (password: password123)`)
  } else {
    console.log('Admin user already exists.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
