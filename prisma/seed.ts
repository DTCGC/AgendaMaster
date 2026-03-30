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
  // --- 1. Seed Meeting Templates from CSV ---
  const csvPath = path.join(process.cwd(), 'public', 'assets', 'templates', 'agenda-template.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  const existingRegular = await prisma.meetingTemplate.findFirst({
    where: { type: 'Regular' }
  });

  if (!existingRegular) {
    await prisma.meetingTemplate.create({
      data: {
        type: 'Regular',
        schemaStructure: csvContent,
      },
    });
    console.log('✓ Seeded "Regular" Meeting Template from CSV.')
  } else {
    console.log('• Regular template already exists, skipping.')
  }

  // --- 2. Create Production Admin Account ---
  const adminEmail = 'coquitlamgavel@gmail.com'
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('gcgm1450', 12)
    await prisma.user.create({
      data: {
        email: adminEmail,
        firstName: 'Admin',
        lastName: 'DTCGC',
        role: 'ADMIN',
        passwordHash,
      }
    })
    console.log(`✓ Production admin created: ${adminEmail}`)
  } else {
    console.log(`• Admin ${adminEmail} already exists, skipping.`)
  }

  console.log('\n✓ Database seed completed successfully.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
