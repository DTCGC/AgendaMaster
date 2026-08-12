/**
 * Database Seed Script
 *
 * Initializes the production database with required bootstrap data:
 *   1. Regular Meeting Template — parsed from the CSV file in public/assets/templates/
 *   2. Production Admin Account — the club's shared admin credential (coquitlamgavel@gmail.com)
 *
 * Idempotent: skips creation if records already exist.
 * Run via: `npx tsx prisma/seed.ts` (also runs on every deploy via CI/CD).
 */

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
    // Targeted repairs for already-seeded templates. The seed is idempotent and
    // never wholesale-overwrites an existing template — a live DB may carry
    // hand-edits worth keeping — so corrections made to the CSV file have to be
    // replayed onto the stored schemaStructure one at a time. Each repair is
    // written to be a no-op once applied, so this stays safe to run every deploy.
    let repaired = existingRegular.schemaStructure;
    const applied: string[] = [];

    // Legacy "General Feadback" typo.
    if (repaired.includes('Feadback')) {
      repaired = repaired.replace(/Feadback/g, 'Feedback');
      applied.push('"Feadback" typo');
    }

    // Dismissal is now permanently Franklin's, like the other hard-coded names
    // baked into the template (Roles For Next Meeting → John, Business Meeting
    // → Andrew). Older templates carry the NAME placeholder there — and the
    // rule is permanent, so overwrite whatever the cell holds. The lookahead is
    // what makes the repair a no-op once it has already been applied.
    const withFranklin = repaired.replace(/,Dismissal,,(?!Franklin,)[^,]*,/g, ',Dismissal,,Franklin,');
    if (withFranklin !== repaired) {
      repaired = withFranklin;
      applied.push('Dismissal → Franklin');
    }

    if (applied.length > 0) {
      await prisma.meetingTemplate.update({
        where: { id: existingRegular.id },
        data: { schemaStructure: repaired },
      });
      console.log(`✓ Repaired existing Regular template: ${applied.join(', ')}.`)
    } else {
      console.log('• Regular template already exists and is up to date, skipping.')
    }
  }

  // --- 2. Create Production Admin Account ---
  const adminEmail = 'coquitlamgavel@gmail.com'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD

  if (!adminPassword) {
    console.warn('• SEED_ADMIN_PASSWORD not set — skipping admin seed.')
  } else {
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 12)
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
