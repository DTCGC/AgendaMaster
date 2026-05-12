/**
 * Database Connection Module
 *
 * Provides a singleton PrismaClient instance backed by better-sqlite3.
 * In production, DATABASE_URL points to an external path (/var/www/data/prod.db)
 * to survive deployments. In development, it defaults to ./dev.db.
 *
 * The singleton pattern prevents connection exhaustion during Next.js
 * hot-reloads in development — each reload would otherwise create a new client.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

// Strip the "file:" prefix that Prisma expects, since better-sqlite3 needs a raw path.
// Falls back to the local dev database if DATABASE_URL is not set.
const dbUrl = process.env.DATABASE_URL?.replace('file:', '') || './dev.db'

// The adapter bridges Prisma's query engine to better-sqlite3's synchronous API.
// Guard against browser environments where Node.js-only modules are unavailable.
const adapter = typeof window === 'undefined' ? new PrismaBetterSqlite3({ url: dbUrl }) : undefined

// Attach the client to globalThis so it persists across dev hot-reloads.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const db = globalForPrisma.prisma || new PrismaClient(adapter ? { adapter } : undefined)

// Only cache the singleton in development; production creates a fresh client per cold start.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
